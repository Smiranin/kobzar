# Build Kobzar as a standalone service with thin Clients, not as a Dojo feature and not as an iOS keyboard

**Status:** accepted

The first place the owner wants dictation is the Dojo, so the shortest path was a feature inside the Dojo; the most complete path was a native iOS keyboard that dictates into any field of any app. We chose neither: Kobzar is its own service with its own repository, and every way of using it is a thin Client that sends a Recording and receives a Transcript. The expensive, reusable part is the recognition (the model, the Dictionary, the Samples); the Clients are small, so the first one (a microphone button in the Dojo) costs little and later ones (a Mac hotkey, an iOS Shortcut, a native keyboard) can be added without touching the service.

## Considered Options

- **Standalone service, thin Clients** (chosen): one place for recognition quality, any number of Clients, the Dojo stays independent of it. Costs a second service to run and a contract between them.
- **A feature inside the Dojo**: fastest to a working button, but the recognition would be tied to the Dojo and unusable anywhere else.
- **Native iOS keyboard first**: dictation in every app with no paste step, but iOS keyboards have no microphone access and need a workaround through a companion app, plus Swift, a paid developer account and weeks of work, all before knowing whether the recognition itself is good enough. It is also iOS only.

## Consequences

- The Dojo must work exactly as before when Kobzar is not installed or not running.
- The native keyboard is deferred, not rejected: it becomes worth its cost only after the Samples show that Kobzar's quality is good, and it would be one more Client of the same service.
- The contract between Kobzar and its Clients has to allow things the first Client does not use yet (an explicit language, hints, a processing mode), so that later Clients do not force a change.
