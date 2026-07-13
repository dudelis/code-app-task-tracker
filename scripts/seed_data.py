"""
seed_data.py — Populate the TaskTracker Dataverse tables with mock data.

Creates a realistic set of Customers -> Projects -> Tasks, plus shared Labels
and per-Task Notes, and associates Labels to Tasks via the many-to-many
relationship. Useful for verifying the code app end-to-end.

Idempotent-ish: by default it skips seeding if any Customers already exist.
Pass --force to seed anyway (this may create duplicates).

Usage:
    python scripts/seed_data.py
    python scripts/seed_data.py --force
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from auth import get_credential, get_token, load_env

from PowerPlatform.Dataverse.client import DataverseClient

# --- Choice values (mirror setup_schema.py) --------------------------------
STATUS = {
    "Backlog": 100000000,
    "ToDo": 100000001,
    "InProgress": 100000002,
    "Waiting": 100000003,
    "Done": 100000004,
}
RESPONSIBLE = {"Me": 100000000, "Customer": 100000001}
COLOR = {
    "Red": 100000000,
    "Orange": 100000001,
    "Yellow": 100000002,
    "Green": 100000003,
    "Blue": 100000004,
    "Purple": 100000005,
    "Gray": 100000006,
}

MN_RELATIONSHIP = "csa_csa_task_csa_label"


def _today_plus(days):
    return (date.today() + timedelta(days=days)).isoformat()


def _web_api(method, path, body=None):
    env = os.environ["DATAVERSE_URL"].rstrip("/")
    url = f"{env}/api/data/v9.2/{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {
        "Authorization": f"Bearer {get_token()}",
        "Content-Type": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode() or "{}"
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {detail}") from e


def _task_labels_nav_property():
    """Return the task-side navigation property name for the M:N relationship."""
    meta = _web_api(
        "GET",
        f"RelationshipDefinitions(SchemaName='{MN_RELATIONSHIP}')"
        "/Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata"
        "?$select=Entity1LogicalName,Entity1NavigationPropertyName,"
        "Entity2LogicalName,Entity2NavigationPropertyName",
    )
    if meta.get("Entity1LogicalName") == "csa_task":
        return meta["Entity1NavigationPropertyName"]
    return meta["Entity2NavigationPropertyName"]


def _associate_label(task_id, label_id, nav_property):
    env = os.environ["DATAVERSE_URL"].rstrip("/")
    _web_api(
        "POST",
        f"csa_tasks({task_id})/{nav_property}/$ref",
        {"@odata.id": f"{env}/api/data/v9.2/csa_labels({label_id})"},
    )


# ---------------------------------------------------------------------------
# Mock data definition
# ---------------------------------------------------------------------------
# Each customer: name, active, and a list of projects.
# Each project: name, active, and a list of tasks.
# Each task: name, status, responsible, due (days from today or None),
#            sortorder, description, labels (names), notes (list of text).
DATA = [
    {
        "name": "Contoso Ltd",
        "active": True,
        "projects": [
            {
                "name": "Website Redesign",
                "active": True,
                "tasks": [
                    {
                        "name": "Gather requirements",
                        "status": "Done",
                        "responsible": "Me",
                        "due": -10,
                        "sortorder": 10,
                        "description": "Kickoff workshop with stakeholders.",
                        "labels": ["Important"],
                        "notes": ["Workshop held, notes captured in wiki."],
                    },
                    {
                        "name": "Design homepage mockups",
                        "status": "InProgress",
                        "responsible": "Me",
                        "due": 3,
                        "sortorder": 20,
                        "description": "Three concept variations for review.",
                        "labels": ["Urgent", "Important"],
                        "notes": ["Concept A and B ready.", "Waiting on brand colors."],
                    },
                    {
                        "name": "Client review of mockups",
                        "status": "Waiting",
                        "responsible": "Customer",
                        "due": 5,
                        "sortorder": 30,
                        "description": "Awaiting sign-off from marketing.",
                        "labels": ["Not urgent"],
                        "notes": ["Sent mockups over email on Monday."],
                    },
                    {
                        "name": "Implement responsive layout",
                        "status": "ToDo",
                        "responsible": "Me",
                        "due": 14,
                        "sortorder": 40,
                        "description": "Mobile-first CSS grid implementation.",
                        "labels": [],
                        "notes": [],
                    },
                ],
            },
            {
                "name": "SEO Improvements",
                "active": True,
                "tasks": [
                    {
                        "name": "Audit current keywords",
                        "status": "Backlog",
                        "responsible": None,
                        "due": None,
                        "sortorder": 10,
                        "description": "Baseline ranking report.",
                        "labels": ["Not urgent", "Important"],
                        "notes": [],
                    },
                    {
                        "name": "Fix meta descriptions",
                        "status": "ToDo",
                        "responsible": "Me",
                        "due": 7,
                        "sortorder": 20,
                        "description": None,
                        "labels": [],
                        "notes": ["Roughly 40 pages need updates."],
                    },
                ],
            },
        ],
    },
    {
        "name": "Fabrikam Inc",
        "active": True,
        "projects": [
            {
                "name": "Mobile App MVP",
                "active": True,
                "tasks": [
                    {
                        "name": "Set up CI/CD pipeline",
                        "status": "InProgress",
                        "responsible": "Me",
                        "due": 2,
                        "sortorder": 10,
                        "description": "GitHub Actions + app store deploy.",
                        "labels": ["Urgent"],
                        "notes": ["Build stage green, deploy stage pending secrets."],
                    },
                    {
                        "name": "Design onboarding flow",
                        "status": "ToDo",
                        "responsible": "Me",
                        "due": 9,
                        "sortorder": 20,
                        "description": None,
                        "labels": ["Important"],
                        "notes": [],
                    },
                    {
                        "name": "Security review",
                        "status": "Backlog",
                        "responsible": None,
                        "due": None,
                        "sortorder": 30,
                        "description": "Third-party pen test before launch.",
                        "labels": ["Not urgent"],
                        "notes": [],
                    },
                ],
            },
            {
                "name": "Legacy Migration",
                "active": False,
                "tasks": [
                    {
                        "name": "Archive old database",
                        "status": "Done",
                        "responsible": "Me",
                        "due": -30,
                        "sortorder": 10,
                        "description": "Snapshot taken and stored in cold storage.",
                        "labels": [],
                        "notes": ["Migration completed last quarter."],
                    },
                ],
            },
        ],
    },
    {
        "name": "Northwind Traders",
        "active": False,
        "projects": [
            {
                "name": "Annual Support Retainer",
                "active": True,
                "tasks": [
                    {
                        "name": "Q3 check-in call",
                        "status": "Waiting",
                        "responsible": "Customer",
                        "due": 6,
                        "sortorder": 10,
                        "description": "Confirm availability with their PM.",
                        "labels": ["Not important"],
                        "notes": ["Proposed three time slots."],
                    },
                ],
            },
        ],
    },
]

LABELS = [
    ("Urgent", "Red"),
    ("Not urgent", "Green"),
    ("Important", "Orange"),
    ("Not important", "Gray"),
]


def main():
    force = "--force" in sys.argv
    load_env()
    client = DataverseClient(os.environ["DATAVERSE_URL"], get_credential())

    existing = list(client.records.list("csa_customer", select=["csa_customerid"]))
    if existing and not force:
        print(
            f"Found {len(existing)} existing customer(s). Skipping seed to avoid "
            "duplicates. Re-run with --force to seed anyway."
        )
        return

    # --- Labels (shared) ----------------------------------------------------
    print("Creating labels...", flush=True)
    label_ids = {}
    for name, color in LABELS:
        lid = client.records.create(
            "csa_label", {"csa_name": name, "csa_color": COLOR[color]}
        )
        label_ids[name] = lid
        print(f"  label {name} -> {lid}", flush=True)

    nav_property = _task_labels_nav_property()
    print(f"  M:N task->label nav property: {nav_property}", flush=True)

    # --- Customers / Projects / Tasks / Notes / associations ----------------
    counts = {"customers": 0, "projects": 0, "tasks": 0, "notes": 0, "links": 0}
    for cust in DATA:
        print(f"Customer: {cust['name']}", flush=True)
        cust_id = client.records.create(
            "csa_customer", {"csa_name": cust["name"], "csa_active": cust["active"]}
        )
        counts["customers"] += 1

        for proj in cust["projects"]:
            proj_id = client.records.create(
                "csa_project",
                {
                    "csa_name": proj["name"],
                    "csa_active": proj["active"],
                    "csa_CustomerId@odata.bind": f"/csa_customers({cust_id})",
                },
            )
            counts["projects"] += 1
            print(f"  Project: {proj['name']}", flush=True)

            for task in proj["tasks"]:
                body = {
                    "csa_name": task["name"],
                    "csa_status": STATUS[task["status"]],
                    "csa_sortorder": task["sortorder"],
                    "csa_ProjectId@odata.bind": f"/csa_projects({proj_id})",
                }
                if task["responsible"] is not None:
                    body["csa_responsible"] = RESPONSIBLE[task["responsible"]]
                if task["due"] is not None:
                    body["csa_duedate"] = _today_plus(task["due"])
                if task["description"]:
                    body["csa_description"] = task["description"]

                task_id = client.records.create("csa_task", body)
                counts["tasks"] += 1
                print(f"    Task: {task['name']} [{task['status']}]", flush=True)

                for label_name in task["labels"]:
                    _associate_label(task_id, label_ids[label_name], nav_property)
                    counts["links"] += 1

                for note_text in task["notes"]:
                    client.records.create(
                        "csa_note",
                        {
                            "csa_name": note_text[:60],
                            "csa_text": note_text,
                            "csa_TaskId@odata.bind": f"/csa_tasks({task_id})",
                        },
                    )
                    counts["notes"] += 1

    print(
        "\nDone. Created "
        f"{counts['customers']} customers, {counts['projects']} projects, "
        f"{counts['tasks']} tasks, {counts['notes']} notes, "
        f"{len(label_ids)} labels, {counts['links']} task-label links.",
        flush=True,
    )


if __name__ == "__main__":
    main()
