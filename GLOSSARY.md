# Kobzar

A personal speech-to-text service that runs on the owner's own Mac: a Client sends recorded speech and gets text back. It exists because built-in phone dictation handles Russian speech mixed with English technical terms badly, and paid services cost money. The name is the Ukrainian word for a wandering singer who carried spoken words from place to place.

## Language

**Kobzar**:
The service itself: the thing that turns a Recording into a Transcript.
_Avoid_: Pysar, server, backend, transcriber, STT

**Recording**:
One piece of recorded speech sent to Kobzar to be turned into text. It is not kept after its Transcript is produced.
_Avoid_: Holos, audio, clip, file, utterance

**Transcript**:
The finished text produced from one Recording, in the language that was spoken.
_Avoid_: Duma, transcription, result, output

**Dictionary**:
The owner's list of words (technical terms, names, jargon) that Kobzar must spell correctly in a Transcript. Maintained by the owner.
_Avoid_: Lebiika, vocabulary, glossary, term list, prompt

**Samples**:
The owner's set of test phrases, each a saved Recording with the text it should produce, used to judge Kobzar's speed and accuracy.
_Avoid_: Vyzvilka, eval, benchmark, test set

**Client**:
A program that sends a Recording to Kobzar and receives the Transcript (the Dojo, the test page).
_Avoid_: Slukhach, consumer, frontend, caller
