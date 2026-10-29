# UCI section type contracts

`root/usr/share/ucode/hijpass/types/sections.uc` declares the raw UCI hierarchy.
`UciSection` owns metadata; `EnabledSection` adds the raw enable option, and
`NamedNodeSection` shares node identity, port and process options.
`RawCommandOptions` is composed only by custom proxies and server nodes.
Each concrete section refines `.type` and declares its own configuration fields.
The `type` option is separate: it selects a proxy protocol or shunt core.

`types/proxy-sections.uc` declares the raw proxy family separately. Its common
base contains the node header and local runtime options. Generated nodes add
core/log settings; remote protocols compose endpoint and upstream capability.
TLS, Reality, multiplexing, network and password options are independent
capabilities. Each of the six protocol sections composes only the capabilities
selected by its runtime decoder in `config/protocol/` and owns its remaining
protocol fields. `ProxyNodeSection` is a union of those generated protocols,
custom command nodes and unfinished protocol-selection drafts.

`types/transport.uc` separates HTTP, WebSocket, gRPC, HTTPUpgrade and XHTTP
options, plus the no-extra-transport case. Each mode has a raw string-based
contract and a decoded contract. A mode converter accepts its concrete input
type, such as `GrpcTransportOptions`, so required converted fields remain
non-null inside that converter. The dispatcher retains the full transport
union and its existing unsupported-mode errors.

Core JSON results share `CoreConfigBase`; `SingboxConfig` owns `route`, and
`XrayConfig` owns `routing` and `burstObservatory`. The concrete generators
return their own core type, while generic rendering uses the `CoreConfig` union.
Mutable native JSON builders and partial utility views remain separate from
these complete result contracts.

These are comment-only structural types, using
[intersection types](https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types).
They create no runtime exports or class instances. Missing business options remain
nullable; raw ports and flags remain strings until the business conversion step.
Option/list fields accept both string and string-array forms where supported.
The base index signature preserves unknown and historical options without
replacing the explicitly declared fields of current section types.

`config/sections.uc` exposes typed business queries such as
`findShuntSection(sections): ShuntSection|null` and
`filterProxyNodeSections(sections): ProxyNodeSection[]`. They share the generic
lookup implementation and preserve original objects, order, null and empty-array
semantics. Generic queries remain available for unknown section types. Named
query contracts work with the semantic checker and navigation provider directly;
they do not require a dependent return type inferred from a string argument.

Configuration rendering accepts an optional `target` section ID for both proxy
nodes and shunt sections. The entry point finds that ID in the supplied snapshot
and dispatches by `.type`; unknown IDs and unsupported section types fail
explicitly. LuCI passes the actual shunt ID, including IDs assigned to anonymous
sections. The string `shunt` is no longer a special target: it works only when it
is the actual section ID. Callers using `--target shunt` must pass their section's
ID instead. Without a target, rendering still uses the first shunt section.
`config/generate.uc` owns enable-state selection and the preview/save policy.
CLI, RPC and service configuration preparation all use this entry point.
Normal generation selects enabled proxies and the enabled template shunt;
explicit previews may select a disabled target, while referenced proxies must
still be enabled. Existing defaults remain explicit here: proxies and rules
require `enabled == '1'`, while shunt and DNS nodes default to enabled unless
`enabled == '0'`. Saving with the main service disabled checks snapshot structure
without requiring unfinished node forms to generate successfully.

The lower `coreconfig/render.uc` accepts a `GenerationInput` containing
`rootProxies`, `availableProxies` and an optional `RoutingInput`. It always
returns `GeneratedConfigs`; it does not read enable flags, select targets or
vary its return shape by preview mode. Dependency resolution takes the explicit
root and candidate arrays. Routing preparation consumes the supplied shunt,
DNS nodes and rules without enable filtering. An empty root array means no
proxy configuration even when candidates exist. Missing references, duplicate
names, cycles, protocol errors and port conflicts remain generation errors.

Raw configuration and converted models describe different stages:

```text
ProxyNodeSection -> decodeProxy() -> DecodedProxyNode -> core configuration
ShuntSection     -> prepare()     -> RoutingSettings  -> core configuration
ServerNodeSection -> serverPlan() -> ServicePlan
```

The raw declarations describe expected option shapes, not completed business
validation. Querying a section never converts flags, checks protocol credentials
or mutates configuration. Existing validation, defaults and enable semantics stay
in their business modules.

`NodeIdentity`, `LogSource`, `RuleMatchOptions` and `DnsmasqOptions` are field views
for utilities that also accept partial objects. They are not complete raw
sections. A function accepting a known complete section should use its concrete
section type; generic decoding and snapshot validation use `UciSection`.

Field navigation should select an explicit inherited field before a catch-all
index within an intersection. Union alternatives keep their distinct targets.
An unrefined union can therefore expose several declarations, including an
index fallback from a variant that does not declare the selected field.
Concrete protocol inputs have their own explicit field locations; foreign
or historical options retain only the base index fallback.
The real-editor tests cover inherited `shunt.enabled`, node fields and named
return hints alongside the native section-query regression tests. Protocol
tests derive supported fields from the actual decoder declarations and also
verify that foreign protocol fields are not explicitly declared.

Stable rule plans, firewall parameters, validation responses, editor responses
and diagnostic summaries also have named result contracts. Open core JSON
fragments use `JsonObject`, preserving nullable and array variants. The generic
JSON cleanup helper retains its value union, and template rendering retains its
generic namespace parameter.
