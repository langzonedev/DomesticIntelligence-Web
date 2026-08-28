# Domestic Intelligence Web — Product Direction

The Web/PWA repository is the public prototype and compatibility surface for Domestic Intelligence. It should demonstrate the same product philosophy as the native client without becoming the authoritative implementation of privileged integrations.

## North Star

Domestic Intelligence is a polished, map-first property operating layer. The property, rooms and physical assets are the focus; smart-home platforms and protocols are supporting data sources rather than the user-facing product.

## Principles for the Web prototype

- Keep the property map as the dominant interaction surface.
- Demonstrate device and asset placement in a way that works for both simple and sophisticated homes.
- Keep ordinary labels human-readable and provider-neutral.
- Use progressive disclosure so advanced technical metadata does not clutter homeowner flows.
- Model smart-home integrations as interchangeable providers rather than core product dependencies.
- Preserve useful manual/offline workflows so Domestic Intelligence remains valuable without any connected ecosystem.
- Reflect a future property lifecycle spanning homeowner, installer, technician, property manager, realtor, buyer and future owner.
- Keep real credentials, privileged device access and protected integration logic outside this public repository.

## Product spectrum

The UX should remain coherent whether a property contains:

- a single manually entered or inexpensive smart plug;
- a handful of lights and appliances;
- cameras and access control;
- HVAC and energy systems;
- or a fully integrated smart home with many devices and providers.

The product must scale in capability without scaling the visible complexity of the interface at the same rate.

## Decision test

> Does this make the property easier to understand without making the interface harder to understand?

Use this as the primary UX test for prototype changes.
