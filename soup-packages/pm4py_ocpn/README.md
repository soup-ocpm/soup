# OC-PN discovery for SOUP Studio

Discover Object-Centric Petri Nets with PM4Py from OCEL tables or Memgraph EKG datasets. Select the object types to include in discovery. The resulting analysis is saved in the workspace and can be reopened without rediscovery.

The viewer preserves PM4Py's Petri net notation, including silent transitions, initial/final places, shared activities and variable-multiplicity arcs. It supports zoom, background dragging, fit and horizontal/vertical layout. SVG export contains the full diagram regardless of the current zoom.

Exports: SVG, Graphviz DOT and JSON. JSON includes one PNML net per object type, its initial/final markings, activities and variable-arc annotations; it can be reconstructed with `soup_pkg_pm4py_ocpn.api.decode`. This is not a single conventional PNML file, which would lose the object-centric annotations.

Install the ZIP from SOUP Studio's package manager, or place this directory in `soup-packages/` before building. Requires the `ocel`, `ekg`, `tool_memgraph`, `tool_storage` and `soup_base` packages, PM4Py 2.7.17, Python Graphviz 0.21 and the Graphviz `dot` executable. EKG input currently supports Memgraph.

Discovery follows https://processintelligence.solutions/pm4py/examples/object-centric-event-data#oc-pn-discovery. Event-object qualifiers are projected to unique event-object pairs for discovery; source datasets are not changed.
