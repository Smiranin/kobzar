# Recognise speech only on the owner's Mac, reached over a private network with no authentication

**Status:** accepted

Kobzar turns a Recording into a Transcript with a speech recognition model that runs entirely on the owner's personal MacBook; no Recording or Transcript ever goes to a cloud service. Paid dictation products and cloud speech APIs give good quality with no setup, but the owner does not want to pay per month or per minute and does not want their voice to leave their machine, and the Mac (M5 Pro, 48 GB) is strong enough to run a large model with a delay of a few seconds. Kobzar is reachable only inside the owner's Tailscale network, which also provides the HTTPS a browser needs before it will record from a microphone, so the service has no accounts, no tokens and no login, the same choice the Dojo made.

## Considered Options

- **Local model on the Mac, private network, no in-app auth** (chosen): free to run, private by construction, nothing to maintain beyond the model. Works only while the Mac is on, awake and reachable.
- **Cloud speech API with the owner's key**: works from anywhere and needs no strong hardware, but costs per minute and sends every Recording to a third party.
- **Paid dictation product (Wispr Flow and similar)**: the best experience on the phone today, but a subscription, and the reason this project exists.
- **Model on the phone itself**: works offline, but a phone-sized model is noticeably worse on Russian speech mixed with English terms, and it would have to be built separately for every platform.

## Consequences

- When the Mac is off, asleep or off the private network, Kobzar is unavailable; Clients say so and keep working without dictation. There is no queue of Recordings waiting for the Mac.
- Kobzar must never be bound to a public interface or put behind a public tunnel; if it ever has to be reachable from outside the private network, an authentication layer comes first.
- Speed and accuracy depend on this one machine, so they are judged only there, with the Samples.
