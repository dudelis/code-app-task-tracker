# Hard-delete everything with cascade-down, guarded by typed confirmation for Customers and Projects

Every item (Customer, Project, Task, Label, Note) can be permanently deleted from the app, and deleting a parent cascades down the hierarchy — a Customer takes its Projects → Tasks → Notes and label links with it. There is no soft-delete/undo; Active/Inactive (ADR-independent, per #12) is a visibility control, not a recycle bin.

**Why:** this is a single-user personal tool with no audit or multi-user recovery requirement, so real deletion keeps the data honest and avoids a parallel "trash" concept. Because a Customer/Project delete destroys a large, irreversible subtree, those two deletions require type-to-confirm (the user must type the exact Customer/Project name to enable the delete button); Task/Label/Note deletion uses a plain confirm since the blast radius is small.

**Consequence:** there is no recovery path once confirmed — accepted deliberately. Label deletion detaches that label from every task that carried it. The typed-confirmation guard exists only to slow down the two catastrophic deletions, not to provide reversibility.
