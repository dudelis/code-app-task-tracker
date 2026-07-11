"""Verify the TaskTracker schema: tables, key columns, and their metadata properties."""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_token, load_env


def get(path):
    env = os.environ["DATAVERSE_URL"].rstrip("/")
    req = urllib.request.Request(
        f"{env}/api/data/v9.2/{path}",
        headers={
            "Authorization": f"Bearer {get_token()}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def attr(table, logical, cast):
    return get(
        f"EntityDefinitions(LogicalName='{table}')/Attributes(LogicalName='{logical}')"
        f"/Microsoft.Dynamics.CRM.{cast}"
    )


def main():
    load_env()
    tables = ["csa_customer", "csa_project", "csa_task", "csa_label", "csa_note"]
    print("=== Tables ===")
    for t in tables:
        info = get(f"EntityDefinitions(LogicalName='{t}')?$select=LogicalName,PrimaryNameAttribute,EntitySetName")
        print(f"  {info['LogicalName']:14} primary={info['PrimaryNameAttribute']:12} set={info['EntitySetName']}")

    print("\n=== Key column properties ===")
    checks = [
        ("csa_customer", "csa_active", "BooleanAttributeMetadata"),
        ("csa_project", "csa_active", "BooleanAttributeMetadata"),
        ("csa_project", "csa_customerid", "LookupAttributeMetadata"),
        ("csa_task", "csa_projectid", "LookupAttributeMetadata"),
        ("csa_task", "csa_status", "PicklistAttributeMetadata"),
        ("csa_task", "csa_responsible", "PicklistAttributeMetadata"),
        ("csa_task", "csa_duedate", "DateTimeAttributeMetadata"),
        ("csa_task", "csa_sortorder", "IntegerAttributeMetadata"),
        ("csa_task", "csa_description", "MemoAttributeMetadata"),
        ("csa_label", "csa_color", "PicklistAttributeMetadata"),
        ("csa_note", "csa_text", "MemoAttributeMetadata"),
        ("csa_note", "csa_taskid", "LookupAttributeMetadata"),
    ]
    for table, logical, cast in checks:
        a = attr(table, logical, cast)
        req = a.get("RequiredLevel", {}).get("Value")
        extra = []
        if "DefaultValue" in a and a["DefaultValue"] is not None:
            extra.append(f"default={a['DefaultValue']}")
        if a.get("Format"):
            extra.append(f"format={a['Format']}")
        if a.get("DefaultFormValue") is not None:
            extra.append(f"defaultChoice={a['DefaultFormValue']}")
        print(f"  {table}.{logical:16} {cast:26} required={req} {' '.join(extra)}")


if __name__ == "__main__":
    main()
