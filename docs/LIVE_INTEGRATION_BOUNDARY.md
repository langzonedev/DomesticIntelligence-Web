# Live Integration Boundary

## Product-family direction

Domestic Intelligence is moving toward optional live smart-home integrations, beginning with a planned Google Home Android proof of concept.

The public Web/PWA repository remains a **synthetic staging and compatibility surface**. It should demonstrate the UX concepts around imported devices and provider-linked assets without containing privileged integration credentials, OAuth configuration, protected backend logic or production device-access code.

## Product distinction

Domestic Intelligence should not become another Google Home or Home Assistant dashboard.

Its core model is the property itself:

`Property -> Storey -> physical position -> Asset -> Systems -> Documentation -> History -> Live integrations`

Smart-home platforms are optional data providers within that model.

## Web responsibilities

The Web prototype may safely demonstrate:

- synthetic `Imported device` states;
- provider badges such as Google Home / Matter / Home Assistant;
- unplaced/placed import candidate UX;
- map placement and enrichment flows;
- portable schema compatibility for provider-neutral asset records;
- disconnected/offline presentation states.

It must not contain:

- real OAuth secrets or credentials;
- privileged Google Home access tokens;
- Matter fabric keys;
- real customer device data;
- production device-control logic;
- protected integration algorithms that belong in the private authority repository.

## Current implementation direction

The first real Google Home integration experiment belongs in the private native Android repository, `DomesticIntelligence-Mobile`.

The authoritative product and architecture decision is recorded in the private `DomesticIntelligence` repository.

If the Android spike proves successful, the Web prototype can be updated with synthetic UX that mirrors the accepted import flow while remaining safe for public staging.