# Agentic Command

Agentic Command coordinates interactive coding sessions and durable, human-directed engineering workflows.

## Language

**Managed Run**:
A durable engineering workflow that carries an idea through shaping, specification, ticketing, implementation, verification, and human acceptance. A run may begin from a rough idea or import an artifact from a later phase.
_Avoid_: Managed Session, execution loop, task runner


**Run Workspace**:
The repository-local home for a Managed Run's human-readable artifacts, stored by default under `.agentic/runs/<run-id>/` and excluded from Git locally. Its location and tracking policy may be overridden by the user.
_Avoid_: Temporary directory, system temp, artifact store

**Approval Gate**:
A recorded human decision that permits a Managed Run to cross from Shape to Spec, Spec to Tickets, Tickets to autonomous execution, or final review to completion.
_Avoid_: Checkpoint, automatic approval

**Shape**:
The interactive phase in which the user and a capable worker resolve consequential decisions and maintain relevant domain documentation.
_Avoid_: Intake, requirements gathering, planning

**Spec**:
The phase and revisioned Markdown artifact that define the approved problem, behavior, boundaries, implementation decisions, and observable test seams.
_Avoid_: Plan, prompt

**Tickets**:
The phase and approved dependency graph of independently verifiable tracer-bullet slices derived from a Spec.
_Avoid_: Task list, implementation plan

**Implement**:
The autonomous phase that executes approved Tickets sequentially in a Run Worktree, independently verifies each change set, and commits each passing Ticket.
_Avoid_: Coding, execution loop

**Accept**:
The final human gate that follows successful mission-wide integration verification and authorizes local integration into the selected target branch.
_Avoid_: Complete, publish

**Run Worktree**:
The isolated Git worktree and branch shared sequentially by all Tickets in one Managed Run. Each Ticket begins at the previous verified commit.
_Avoid_: Task worktree, user checkout

**Ticket Commit**:
A local commit created by Agentic Command from the unchanged, independently verified change set for one Ticket.
_Avoid_: Worker commit, checkpoint commit
