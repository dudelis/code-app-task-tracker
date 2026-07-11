"""
setup_schema.py — Create the TaskTracker Dataverse schema (issue #2).

Creates (idempotently):
  - TaskTracker unmanaged solution bound to the CSA Development publisher (prefix csa_)
  - csa_customer : csa_Name (primary), csa_Active (bool, default Yes)
  - csa_project  : csa_Name (primary), csa_CustomerId (lookup->customer, required),
                   csa_Active (bool, default Yes)
  - csa_task     : csa_Name (primary), csa_Description (memo), csa_ProjectId
                   (lookup->project, required), csa_Status (choice, default Backlog),
                   csa_Responsible (choice, optional), csa_DueDate (date-only),
                   csa_SortOrder (int)
  - csa_label    : csa_Name (primary), csa_Color (choice, optional)
  - csa_note     : csa_Name (primary), csa_Text (memo, required),
                   csa_TaskId (lookup->task, required)
  - csa_task <-> csa_label many-to-many relationship

Uses the Python SDK for tables/columns/lookups/M:N and the Web API only for
properties the SDK does not expose (memo columns, boolean default, date-only
format, required level on lookups, choice default value).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
from enum import IntEnum

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_credential, get_token, load_env

from PowerPlatform.Dataverse.client import DataverseClient

SOLUTION = "TaskTracker"
PUBLISHER_UNIQUE = "CSADevelopment"
PREFIX = "csa"


# ---------------------------------------------------------------------------
# Choice option sets
# ---------------------------------------------------------------------------
class Status(IntEnum):
    Backlog = 100000000
    ToDo = 100000001
    InProgress = 100000002
    Waiting = 100000003
    Done = 100000004


class Responsible(IntEnum):
    Me = 100000000
    Customer = 100000001


class Color(IntEnum):
    Red = 100000000
    Orange = 100000001
    Yellow = 100000002
    Green = 100000003
    Blue = 100000004
    Purple = 100000005
    Gray = 100000006


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def retry_metadata(fn, description, max_attempts=5):
    """Run a metadata op, tolerating 'already exists' and lock-contention errors."""
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - SDK raises various error types
            err = str(e).lower()
            if (
                "already exists" in err
                or "0x80040237" in err
                or "0x80048d0b" in err
                or "not unique" in err
                or "is already in use" in err
            ):
                print(f"  {description}: already exists, skipping", flush=True)
                return None
            if "another" in err and "running" in err:
                wait = 10 * (attempt + 1)
                print(
                    f"  {description}: lock contention, waiting {wait}s "
                    f"(attempt {attempt + 1}/{max_attempts})...",
                    flush=True,
                )
                time.sleep(wait)
                continue
            raise
    print(f"  WARNING: {description} failed after {max_attempts} attempts", flush=True)
    return None


def _label(text):
    return {
        "@odata.type": "Microsoft.Dynamics.CRM.Label",
        "LocalizedLabels": [
            {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": text,
                "LanguageCode": 1033,
            }
        ],
    }


def _web_api(method, path, body=None, extra_headers=None):
    env = os.environ["DATAVERSE_URL"].rstrip("/")
    token = get_token()
    url = f"{env}/api/data/v9.2/{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "MSCRM.SolutionUniqueName": SOLUTION,
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() or "{}"
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from e


def create_memo(table, schema_name, display, required, max_length=2000):
    """Create a multiline (memo) column via Web API."""
    def _do():
        return _web_api(
            "POST",
            f"EntityDefinitions(LogicalName='{table}')/Attributes",
            {
                "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
                "SchemaName": schema_name,
                "DisplayName": _label(display),
                "RequiredLevel": {
                    "Value": "ApplicationRequired" if required else "None"
                },
                "MaxLength": max_length,
                "Format": "TextArea",
            },
        )

    retry_metadata(_do, f"memo {schema_name}")


def patch_attribute(table, logical_name, odata_type, props):
    """Update attribute metadata via GET (type-cast) then PUT with MergeLabels."""
    cast = odata_type.split(".")[-1]
    attr_path = (
        f"EntityDefinitions(LogicalName='{table}')"
        f"/Attributes(LogicalName='{logical_name}')/{odata_type}"
    )

    def _do():
        current = _web_api("GET", attr_path)
        current.pop("@odata.context", None)
        current.update(props)
        current["@odata.type"] = odata_type
        return _web_api(
            "PUT",
            f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical_name}')",
            current,
            extra_headers={"MSCRM.MergeLabels": "true"},
        )

    retry_metadata(_do, f"update {table}.{logical_name} ({cast})")


def publish_all():
    def _do():
        return _web_api("POST", "PublishAllXml")

    retry_metadata(_do, "publish customizations")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    load_env()
    client = DataverseClient(os.environ["DATAVERSE_URL"], get_credential())

    # --- Solution -----------------------------------------------------------
    print("Ensuring solution...", flush=True)
    existing = list(
        client.records.list("solution", filter=f"uniquename eq '{SOLUTION}'", select=["solutionid"])
    )
    if existing:
        print(f"  Solution '{SOLUTION}' already exists.", flush=True)
    else:
        pubs = list(
            client.records.list(
                "publisher",
                filter=f"uniquename eq '{PUBLISHER_UNIQUE}'",
                select=["publisherid", "customizationprefix"],
            )
        )
        if not pubs:
            print(f"ERROR: publisher '{PUBLISHER_UNIQUE}' not found.", flush=True)
            sys.exit(1)
        publisher_id = pubs[0]["publisherid"]
        client.records.create(
            "solution",
            {
                "uniquename": SOLUTION,
                "friendlyname": "Task Tracker",
                "version": "1.0.0.0",
                "publisherid@odata.bind": f"/publishers({publisher_id})",
            },
        )
        print(f"  Created solution '{SOLUTION}'.", flush=True)

    # --- Phase 1: tables (primary Name column) ------------------------------
    print("Phase 1: tables...", flush=True)
    tables = ["csa_Customer", "csa_Project", "csa_Task", "csa_Label", "csa_Note"]
    for schema in tables:
        retry_metadata(
            lambda s=schema: client.tables.create(
                s, {}, solution=SOLUTION, primary_column=f"{PREFIX}_Name"
            ),
            f"table {schema}",
        )
        time.sleep(6)
    print("  Waiting for metadata propagation...", flush=True)
    time.sleep(20)

    # --- Phase 2: simple columns (SDK) --------------------------------------
    print("Phase 2: columns...", flush=True)
    retry_metadata(
        lambda: client.tables.add_columns("csa_customer", {"csa_Active": "bool"}),
        "csa_customer.csa_Active",
    )
    retry_metadata(
        lambda: client.tables.add_columns("csa_project", {"csa_Active": "bool"}),
        "csa_project.csa_Active",
    )
    retry_metadata(
        lambda: client.tables.add_columns(
            "csa_task",
            {
                "csa_Status": Status,
                "csa_Responsible": Responsible,
                "csa_DueDate": "datetime",
                "csa_SortOrder": "int",
            },
        ),
        "csa_task columns",
    )
    retry_metadata(
        lambda: client.tables.add_columns("csa_label", {"csa_Color": Color}),
        "csa_label.csa_Color",
    )
    time.sleep(10)

    # --- Phase 2b: memo columns (Web API) -----------------------------------
    print("Phase 2b: memo columns...", flush=True)
    create_memo("csa_task", "csa_Description", "Description", required=False, max_length=4000)
    create_memo("csa_note", "csa_Text", "Text", required=True, max_length=4000)
    time.sleep(10)

    # --- Phase 3: lookups ---------------------------------------------------
    print("Phase 3: lookups...", flush=True)
    retry_metadata(
        lambda: client.tables.create_lookup_field(
            referencing_table="csa_project",
            lookup_field_name="csa_CustomerId",
            referenced_table="csa_customer",
            display_name="Customer",
            solution=SOLUTION,
        ),
        "lookup project->customer",
    )
    time.sleep(6)
    retry_metadata(
        lambda: client.tables.create_lookup_field(
            referencing_table="csa_task",
            lookup_field_name="csa_ProjectId",
            referenced_table="csa_project",
            display_name="Project",
            solution=SOLUTION,
        ),
        "lookup task->project",
    )
    time.sleep(6)
    retry_metadata(
        lambda: client.tables.create_lookup_field(
            referencing_table="csa_note",
            lookup_field_name="csa_TaskId",
            referenced_table="csa_task",
            display_name="Task",
            solution=SOLUTION,
        ),
        "lookup note->task",
    )
    time.sleep(15)

    # --- Phase 4: many-to-many ---------------------------------------------
    print("Phase 4: many-to-many task<->label...", flush=True)
    from PowerPlatform.Dataverse.models.relationship import ManyToManyRelationshipMetadata

    retry_metadata(
        lambda: client.tables.create_many_to_many_relationship(
            ManyToManyRelationshipMetadata(
                schema_name="csa_csa_task_csa_label",
                entity1_logical_name="csa_task",
                entity2_logical_name="csa_label",
            ),
            solution=SOLUTION,
        ),
        "M:N task<->label",
    )
    time.sleep(15)

    # --- Phase 5: property fix-ups (Web API) --------------------------------
    print("Phase 5: defaults / required / formats...", flush=True)
    patch_attribute(
        "csa_customer",
        "csa_active",
        "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        {"DefaultValue": True},
    )
    patch_attribute(
        "csa_project",
        "csa_active",
        "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        {"DefaultValue": True},
    )
    patch_attribute(
        "csa_task",
        "csa_duedate",
        "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        {"Format": "DateOnly"},
    )
    patch_attribute(
        "csa_task",
        "csa_status",
        "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        {"DefaultFormValue": int(Status.Backlog)},
    )
    patch_attribute(
        "csa_project",
        "csa_customerid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "ApplicationRequired"}},
    )
    patch_attribute(
        "csa_task",
        "csa_projectid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "ApplicationRequired"}},
    )
    patch_attribute(
        "csa_note",
        "csa_taskid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "ApplicationRequired"}},
    )

    print("Publishing customizations...", flush=True)
    publish_all()
    print("Schema setup complete.", flush=True)


if __name__ == "__main__":
    main()
