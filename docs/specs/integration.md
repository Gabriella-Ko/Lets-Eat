# Integration spec (script)

Brief version: v1 · Agent id: `integration`

Build this as `scripts/integrate.js`, run after each approved level. Deterministic, no LLM calls.

## Checks
1. Re-run the Validator on every approved level, so a rule change cannot silently break an old level.
2. Character appearances match the approved campaign outline and the Campaign structure guardrails.
3. Every recurring venue matches its registry entry exactly; no venue appears outside its district except at the Night Market.
4. No duplicate ids across levels or registries.
5. Boot test: start the Phaser build headlessly and load levels 01–20 in order (skip levels not yet built, but report them).

## Writes
`logs/integration_audit.log`: SUCCESS or FAILED_BUILD, then one line per problem. Exit code 1 on failure.
