# causal_df

Backend compatibility: **memgraph**. Required packages: `ekg`. Manifest-level
tools: None. See the [manifest](soup-package.json) for Python requirements.

Causal `:DF` build step for trigger/target pairs, contributed to
`ekg.build_steps` with order 450.

The build step uses `BuildContext.df_handled_types` so the standard order-500 DF
step does not recreate DF edges for types already handled by the causal step.
See [server/plugin.py](server/plugin.py) and [server/step.py](server/step.py).

See the [package developer documentation](../README.md) for authoring, packaging
and lifecycle rules.
