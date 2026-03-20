[5 Agent Skill design patterns every ADK developer should know](https://x.com/GoogleCloudTech/status/2033953579824758855)

Here’s a professional summary of the five ADK Agent Skill design patterns:

| Pattern          | Core Concept                                                              | Key Features / Use Cases                                                                              | File Structure / Focus                                                         |
| ---------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Tool Wrapper** | Wraps existing tools or libraries so the agent can directly leverage them | Maps external tool capabilities and rules into a Skill; simple to implement, highly reusable          | `SKILL.md` defines instructions; `references/` contains rules or documentation |
| **Generator**    | Automates structured content generation                                   | Produces reports, documents, code snippets, etc.; template-based output controlled by quality rules   | `assets/` stores templates; `references/` stores quality rules or guidance     |
| **Reviewer**     | Evaluates input content or code and provides structured feedback          | Uses checklists to assess input; output is structured; swapping the checklist changes review logic    | `references/` stores checklists; Skill logic remains uniform and reusable      |
| **Inversion**    | Collects user requirements first before executing actions                 | Multi-phase user input collection prevents assumptions; ensures complete context                      | Skill actively prompts users, gathers inputs, and builds contextual data       |
| **Pipeline**     | Sequential multi-step workflow                                            | Strict phase control; only proceeds when conditions are met; can include other patterns like Reviewer | Skill structured as step1 → step2 → …, each with explicit validation           |

💡 **Composability:** These patterns are not mutually exclusive. Examples:

* A Generator can combine with Inversion to gather required inputs first.
* A Pipeline can include Reviewer, Generator, and other patterns to form a complete workflow.

**Summary:**

> These five patterns help ADK developers structure Agent Skills in a modular, reusable, and composable way, ranging from simple tool wrappers to complex multi-step workflows, improving development efficiency while ensuring predictable and controlled Skill behavior.

