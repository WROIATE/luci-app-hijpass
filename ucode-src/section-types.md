# UCI section type contracts

`root/usr/share/ucode/hijpass/types/sections.uc` declares the raw UCI hierarchy.
`UciSection` owns metadata; `EnabledSection` adds the raw enable option, and
`NamedNodeSection` shares node identity, command, port and process options.
Each concrete section refines `.type` and declares its own configuration fields.
The `type` option is separate: it selects a proxy protocol or shunt core.

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
The real-editor tests cover inherited `shunt.enabled`, node fields and named
return hints alongside the native section-query regression tests.

Stable rule plans, firewall parameters, validation responses, editor responses
and diagnostic summaries also have named result contracts. Open core JSON
fragments use `JsonObject`, preserving nullable and array variants. The generic
JSON cleanup helper retains its value union, and template rendering retains its
generic namespace parameter.
