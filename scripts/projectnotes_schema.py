"""
projectnotes_schema.py — Replace the Note reparenting with a dedicated
ProjectNotes table (design change: keep task notes and project notes separate).

Idempotent. Does three things:
  1. Creates csa_projectnote : csa_Name (primary), csa_Text (memo, required),
     csa_ProjectId (lookup->project, required).
  2. Restores csa_note.csa_TaskId to ApplicationRequired (a Note is once again
     task-scoped only).
  3. Removes the csa_note -> csa_project lookup added earlier (drops the
     csa_projectid column by deleting its relationship).

Run with the repo .venv active.
"""

import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_credential, load_env
from setup_schema import SOLUTION, _web_api, create_memo, patch_attribute, publish_all, retry_metadata
from verify_schema import get

from PowerPlatform.Dataverse.client import DataverseClient


def delete_note_project_relationship():
    """Find and delete the csa_note -> csa_project OneToMany relationship."""
    flt = urllib.parse.quote(
        "ReferencingEntity eq 'csa_note' and ReferencingAttribute eq 'csa_projectid'",
        safe="",
    )
    result = get(
        "RelationshipDefinitions/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
        f"?$filter={flt}&$select=SchemaName,MetadataId"
    )
    rels = result.get("value", [])
    if not rels:
        print("  note->project relationship: not found (already removed)", flush=True)
        return
    for r in rels:
        mid = r["MetadataId"]
        retry_metadata(
            lambda m=mid: _web_api("DELETE", f"RelationshipDefinitions({m})"),
            f"delete relationship {r['SchemaName']}",
        )


def main():
    load_env()
    client = DataverseClient(os.environ["DATAVERSE_URL"], get_credential())

    # --- 1. csa_projectnote table ------------------------------------------
    print("Creating csa_projectnote table...", flush=True)
    retry_metadata(
        lambda: client.tables.create(
            "csa_ProjectNote", {}, solution=SOLUTION, primary_column="csa_Name"
        ),
        "table csa_ProjectNote",
    )
    time.sleep(20)
    create_memo("csa_projectnote", "csa_Text", "Text", required=True, max_length=4000)
    time.sleep(6)
    retry_metadata(
        lambda: client.tables.create_lookup_field(
            referencing_table="csa_projectnote",
            lookup_field_name="csa_ProjectId",
            referenced_table="csa_project",
            display_name="Project",
            solution=SOLUTION,
        ),
        "lookup projectnote->project",
    )
    time.sleep(12)
    patch_attribute(
        "csa_projectnote",
        "csa_projectid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "ApplicationRequired"}},
    )

    # --- 2. restore csa_note.csa_taskid required ---------------------------
    print("Restoring csa_note.csa_taskid required...", flush=True)
    patch_attribute(
        "csa_note",
        "csa_taskid",
        "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        {"RequiredLevel": {"Value": "ApplicationRequired"}},
    )

    # --- 3. remove csa_note -> csa_project lookup --------------------------
    print("Removing csa_note->csa_project lookup...", flush=True)
    delete_note_project_relationship()

    print("Publishing customizations...", flush=True)
    publish_all()
    print("ProjectNotes schema change complete.", flush=True)


if __name__ == "__main__":
    main()
