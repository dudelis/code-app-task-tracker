"""
extend_schema.py — Additive Dataverse schema changes for the tracker/status
context extension (issues #29-#34).

Idempotent and forward-only. Adds:
  - csa_customer : csa_Description (memo), csa_Industry (string),
                   csa_PortfolioSummary (memo)                       [#30, #33]
  - csa_project  : csa_Description (memo), csa_MaterialsUrl (url string),
                   csa_DueDate (date-only), csa_Priority (choice),
                   csa_NotesSummary (memo)                            [#29, #33]
  - csa_contact  : new table; csa_Name (primary), csa_Role (string),
                   csa_Email (email string), csa_Phone (phone string),
                   csa_CustomerId (lookup->customer, required)        [#31]
  - csa_note     : csa_ProjectId (lookup->project, OPTIONAL) and relax the
                   existing csa_TaskId to optional (a note parents to a Task
                   OR a Project, exactly one)                         [#32]
  - csa_contact <-> csa_project many-to-many                          [#34]

Reuses the helpers from setup_schema.py. Run with the repo .venv active.
"""

import os
import sys
import time
from enum import IntEnum

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_credential, load_env
from setup_schema import (
    SOLUTION,
    _label,
    _web_api,
    create_memo,
    patch_attribute,
    publish_all,
    retry_metadata,
)

from PowerPlatform.Dataverse.client import DataverseClient


class Priority(IntEnum):
    High = 100000000
    Normal = 100000001
    Low = 100000002


def create_string(table, schema_name, display, required=False, max_length=200, fmt="Text"):
    """Create a single-line string column via Web API (Text/Email/Url/Phone)."""

    def _do():
        return _web_api(
            "POST",
            f"EntityDefinitions(LogicalName='{table}')/Attributes",
            {
                "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
                "SchemaName": schema_name,
                "DisplayName": _label(display),
                "RequiredLevel": {"Value": "ApplicationRequired" if required else "None"},
                "MaxLength": max_length,
                "FormatName": {"Value": fmt},
            },
        )

    retry_metadata(_do, f"string {schema_name} ({fmt})")


def main():
    load_env()
    client = DataverseClient(os.environ["DATAVERSE_URL"], get_credential())

    # --- Customer columns (#30, #33) ----------------------------------------
    print("Customer columns...", flush=True)
    create_memo("csa_customer", "csa_Description", "Description", required=False, max_length=4000)
    create_string("csa_customer", "csa_Industry", "Industry", max_length=200, fmt="Text")
    create_memo(
        "csa_customer", "csa_PortfolioSummary", "Portfolio Summary", required=False, max_length=4000
    )

    # --- Project columns (#29, #33) -----------------------------------------
    print("Project columns...", flush=True)
    create_memo("csa_project", "csa_Description", "Description", required=False, max_length=4000)
    create_string("csa_project", "csa_MaterialsUrl", "Materials URL", max_length=500, fmt="Url")
    create_memo(
        "csa_project", "csa_NotesSummary", "Notes Summary", required=False, max_length=4000
    )
    retry_metadata(
        lambda: client.tables.add_columns(
            "csa_project", {"csa_DueDate": "datetime", "csa_Priority": Priority}
        ),
        "csa_project DueDate/Priority",
    )
    time.sleep(10)

    # --- Contact table (#31) ------------------------------------------------
    print("Contact table...", flush=True)
    retry_metadata(
        lambda: client.tables.create(
            "csa_Contact", {}, solution=SOLUTION, primary_column="csa_Name"
        ),
        "table csa_Contact",
    )
    time.sleep(20)
    create_string("csa_contact", "csa_Role", "Role", max_length=200, fmt="Text")
    create_string("csa_contact", "csa_Email", "Email", max_length=200, fmt="Email")
    create_string("csa_contact", "csa_Phone", "Phone", max_length=50, fmt="Phone")
    time.sleep(6)
    retry_metadata(
        lambda: client.tables.create_lookup_field(
            referencing_table="csa_contact",
            lookup_field_name="csa_CustomerId",
            referenced_table="csa_customer",
            display_name="Customer",
            solution=SOLUTION,
        ),
        "lookup contact->customer",
    )
    time.sleep(10)

    # --- Note reparenting (#32) ---------------------------------------------
    print("Note -> Project lookup + relax Task requirement...", flush=True)
    retry_metadata(
        lambda: client.tables.create_lookup_field(
            referencing_table="csa_note",
            lookup_field_name="csa_ProjectId",
            referenced_table="csa_project",
            display_name="Project",
            solution=SOLUTION,
        ),
        "lookup note->project",
    )
    time.sleep(10)
    patch_attribute(
        "csa_note",
        "csa_taskid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "None"}},
    )

    # --- Contact <-> Project many-to-many (#34) -----------------------------
    print("M:N contact<->project...", flush=True)
    from PowerPlatform.Dataverse.models.relationship import ManyToManyRelationshipMetadata

    retry_metadata(
        lambda: client.tables.create_many_to_many_relationship(
            ManyToManyRelationshipMetadata(
                schema_name="csa_csa_contact_csa_project",
                entity1_logical_name="csa_contact",
                entity2_logical_name="csa_project",
            ),
            solution=SOLUTION,
        ),
        "M:N contact<->project",
    )
    time.sleep(15)

    # --- Property fix-ups ---------------------------------------------------
    print("Defaults / formats...", flush=True)
    patch_attribute(
        "csa_project",
        "csa_duedate",
        "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        {"Format": "DateOnly"},
    )
    patch_attribute(
        "csa_contact",
        "csa_customerid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "ApplicationRequired"}},
    )

    print("Publishing customizations...", flush=True)
    publish_all()
    print("Extend schema complete.", flush=True)


if __name__ == "__main__":
    main()
