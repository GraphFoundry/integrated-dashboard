# Copilot Background Agents

Guidelines for running multi-step tasks with Copilot agents.

## What Are Background Agents?

Background agents are autonomous AI assistants that can:
- Execute multi-step tasks
- Make file changes
- Run terminal commands
- Create pull requests

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| `planner` | Plan implementation | Before major changes |
| `implementer` | Make code changes | Writing new code |
| `reviewer` | Review code quality | Before merging |
| `test-engineer` | Write tests | Adding test coverage |
| `performance-analyzer` | Optimize performance | Performance issues |
| `accessibility-reviewer` | Check a11y | Accessibility audits |
| `feature-builder` | Build features | New feature development |
| `architecture-reviewer` | Review architecture | Structure changes |
| `design-system` | Maintain consistency | UI component work |

## How to Use Agents

### Invoking an Agent
```
@workspace /agent:planner Create a plan for adding user settings page
```

### Agent Handoffs
Agents can hand off to each other:
```
Planner → Implementer → Test Engineer → Reviewer
```

### Example Workflow

1. **Plan the work**
   ```
   @workspace /agent:planner Add pagination to the alerts table
   ```

2. **Implement changes**
   ```
   @workspace /agent:implementer Implement the pagination plan
   ```

3. **Add tests**
   ```
   @workspace /agent:test-engineer Add tests for pagination
   ```

4. **Review**
   ```
   @workspace /agent:reviewer Review the pagination changes
   ```

## Agent Capabilities

### Read Operations
- Read file contents
- Search codebase
- Analyze code structure
- Check for errors

### Write Operations
- Create new files
- Edit existing files
- Run terminal commands
- Install dependencies

### Analysis
- Review code quality
- Check performance
- Validate accessibility
- Ensure type safety

## Best Practices

### Be Specific
```
# ❌ Vague
"Fix the page"

# ✅ Specific
"Fix the null pointer error in AlertCard when alert.metadata is undefined"
```

### Provide Context
```
# ❌ No context
"Add a component"

# ✅ With context
"Add a StatusBadge component that displays alert severity with appropriate colors (critical=red, warning=yellow, info=blue)"
```

### Review Agent Output
- Always review changes before committing
- Verify the solution makes sense
- Run tests to confirm functionality
- Check for unintended side effects

## Agent Configuration

Agents are configured in `.github/agents/*.agent.md`:

```yaml
---
description: 'Agent purpose'
model: 'claude-sonnet-4-20250514'
tools: ['read_file', 'create_file', 'replace_string_in_file', 'run_in_terminal']
handoffs: ['other-agent']
---

# Agent Name

## Instructions
[Detailed instructions for the agent]

## Checklist
[Steps the agent should follow]
```

## Monitoring Agent Tasks

### Check Progress
- Agent shows current step
- View file changes in real-time
- Terminal output visible

### Interrupt if Needed
- Cancel if going wrong direction
- Provide clarification
- Start over with better prompt

## Safety Considerations

### What Agents Should NOT Do
- Commit directly to main
- Run destructive commands
- Modify security configurations
- Access external services without approval

### Review Before Accepting
1. Check all file changes
2. Run the test suite
3. Verify functionality manually
4. Review any terminal commands run

## Troubleshooting

### Agent Not Following Instructions
- Be more specific in your request
- Reference specific files or patterns
- Break into smaller tasks

### Agent Making Wrong Changes
- Cancel and provide clarification
- Reference the correct instruction files
- Show examples of expected output

### Agent Stuck
- Provide additional context
- Simplify the task
- Try a different agent
