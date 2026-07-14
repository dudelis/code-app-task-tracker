# Task Tracker

A personal Dataverse-backed app for tracking work across multiple customers. It gives a single overview of everything in flight — organized as Customer → Project → Task — and lets work be moved between stages, labeled, assigned, and annotated.

## Language

**Customer**:
A person or organization you are doing work for. Sits at the top of the hierarchy; every Project belongs to exactly one Customer. A Customer is either Active or Inactive.
_Avoid_: Client, account, company

**Project**:
Any distinct direction, activity, or stream of work under a Customer. Deliberately loose — a Project need not be a formal "project"; it may be an initiative, a workstream, an area of responsibility, or just a bucket of related work. Contains Tasks. A Project is either Active or Inactive.
_Avoid_: Workstream, initiative, engagement, area (these are all just a Project here)

**Task**:
A single unit of work under a Project. The thing that actually gets tracked, moved, labeled, assigned, and annotated.
_Avoid_: Item, ticket, to-do, activity

**Status**:
The stage a Task is currently in as it moves toward completion: Backlog, To Do, In Progress, Waiting, or Done. Every Task has exactly one Status. Changing a Task's Status is the core board action — done by dragging between columns or picking from a dropdown.
_Avoid_: Stage, state, phase, bucket

**Active** / **Inactive**:
Whether a Customer or a Project is currently being worked. Inactive ones can be hidden from views so only live work is shown. The default views show only Active Customers and Active Projects.
_Avoid_: Archived, closed, on hold, paused

**Bucket**:
A UI-only word for a vertical column on the board. Each Bucket is a Status; a Task moves horizontally between Buckets as its Status changes. Not its own concept — the underlying concept is always Status.
_Avoid_: Column; do not use Bucket for a Project grouping (that is a Swimlane).

**Swimlane**:
A UI-only word for a horizontal row on the board. Each Swimlane is one Project; every Task in the row belongs to that Project. Not its own concept — the underlying concept is always Project.
_Avoid_: Row, lane, track.

**Label**:
A reusable tag attached to a Task to classify it (e.g., Urgent, Not urgent, Important, Not important). A Task can carry several Labels at once. Labels are shared globally — the same set is reused across every Customer and Project so work can be filtered consistently everywhere.
_Avoid_: Tag, category, flag

**Responsible**:
Whose court a Task is currently in: either Me (I need to act) or Customer (it's on their side). Optional — a Task may have no Responsible until it's decided. Pairs with the Waiting status to surface "waiting on the client" work.
_Avoid_: Assignee, owner, assigned to

**Note**:
A single dated entry recorded against a Task. Notes accumulate as separate timestamped records but are shown together as one chronological timeline on the task (like the Dynamics timeline), so the full history of a task is visible in one place.
_Avoid_: Comment, annotation, log entry

**Project Note**:
A single dated entry recorded against a Project — a distinct concept with its own table, separate from a task-scoped Note. Project Notes capture informational context (an FYI, a decision, a customer update) that isn't itself a unit of work; actionable items are Tasks, not Project Notes. Like Notes, they accumulate as timestamped records shown together as one chronological timeline on the project.
_Avoid_: Comment, annotation, log entry; do not conflate with a task Note

**Contact**:
A person at a Customer — name, role, email, phone. Every Contact belongs to exactly one Customer and can be linked to any number of that Customer's Projects. Contacts are the people you deal with, and their email addresses are how incoming mail gets matched back to the right Customer.
_Avoid_: Person, lead, stakeholder, attendee

**Notes Summary**:
A rolling, regenerated digest — not a hand-written note. A Project's Notes Summary condenses that Project's Project Notes into a current-state paragraph; a Customer's Notes Summary is a summary-over-summaries across that Customer's Active Projects. Both are derived views kept fresh by the status workflow, distinct from the append-only note timelines they summarize.
_Avoid_: Digest, recap, overview (as concept names)
