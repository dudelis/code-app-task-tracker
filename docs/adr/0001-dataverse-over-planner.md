# Use Dataverse as the backend instead of Microsoft Planner

The task tracker stores its Customers, Projects, Tasks, Labels, and Notes in Microsoft Dataverse rather than Microsoft Planner, even though Planner offers the board/bucket experience out of the box.

**Why:** the AI tooling used to build and operate this app can integrate with Dataverse through its API, but cannot integrate with Planner the same way. Dataverse gives programmatic table/record access, a code app can be built directly on it, and it keeps everything in one solution under a chosen publisher.

**Consequence:** the board, labels, and timeline that Planner provides for free must be built ourselves on top of the custom tables — accepted as the cost of having a fully API-addressable backend.
