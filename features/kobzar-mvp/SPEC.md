# Kobzar MVP: a personal speech-to-text service

**ADRs:** ../../adr/0001-local-recognition-on-the-owners-mac.md, ../../adr/0002-standalone-service-with-thin-clients.md
**Status:** draft

## Problem Statement

The owner wants to dictate text on the phone instead of typing it, first of all answers and questions to the Sensei in the Dojo. The owner speaks Russian about nine times out of ten, with English technical terms and developer slang inside the sentence, and sometimes speaks plain English. The dictation built into the phone handles this speech so badly that it is useless: terms are misheard and misspelled, and fixing the text takes longer than typing it. Paid products such as Wispr Flow do it well but cost a subscription, and they send the owner's voice to someone else's servers.

## Goal and Success Criteria

Give the owner a private service that turns recorded speech into text well enough to replace typing, and that any of the owner's tools can use.

The MVP is done when:

1. The owner can record a phrase on the phone and receive its Transcript from Kobzar running on the personal Mac.
2. The owner has a set of Samples recorded with their own phone and voice, and one action runs Kobzar over all of them and shows, for each, the Transcript next to the expected text, the differences and the time taken.
3. The owner, looking at that run, judges speed and accuracy to be good enough. There is no fixed pass mark; the reference points are that words from the Dictionary are spelled correctly in roughly nine cases out of ten and that a thirty-second Recording comes back within about three seconds of being sent.
4. The Dojo's microphone button (a separate piece of work, see Further Notes) can be built on Kobzar without changing Kobzar.

## Solution

Kobzar is a service the owner starts on the personal Mac. A Client sends it one Recording and gets back one Transcript: the words that were spoken, in the language they were spoken in, with punctuation and capital letters. Nothing leaves the Mac, and nothing is kept once the Transcript has been returned.

The owner keeps a Dictionary: a private list of words Kobzar must get right, such as names of libraries and functions and the owner's own slang. When Kobzar spells a word wrong, the owner adds it to the Dictionary and the next Recording benefits.

Kobzar comes with a test page. It is a tool for checking and tuning, not for daily use: the owner records a phrase there, sees the Transcript and the time it took, and can save the phrase together with the correct text as one of the Samples. Running the Samples is how the owner decides whether Kobzar is good enough and whether a change made it better or worse.

Kobzar is reachable only from the owner's own devices over the private network. When the Mac is off or asleep, Kobzar is simply unavailable.

## User Stories

1. As the owner, I want to send a Recording of my speech and get a Transcript back, so that I can dictate instead of typing.
2. As the owner, I want Russian speech to be transcribed in Russian, so that the text is what I said.
3. As the owner, I want English technical terms inside a Russian sentence to be written in Latin letters and spelled correctly, so that I do not have to fix every term by hand.
4. As the owner, I want developer slang to be written in Cyrillic the way I said it, so that the Transcript sounds like me.
5. As the owner, I want to ask for English explicitly when I am going to speak English, so that English speech is not forced into Russian.
6. As the owner, I want Russian to be assumed when I do not say otherwise, so that the common case needs no choice.
7. As the owner, I want the Transcript to have punctuation and capital letters, so that it reads as written text.
8. As the owner, I want the Transcript to contain only what I said, with nothing rephrased, so that an answer in the Dojo stays my own words.
9. As the owner, I want a Recording with no speech in it to produce an empty Transcript, so that invented phrases never end up in my text.
10. As the owner, I want to keep a Dictionary of words Kobzar must spell correctly, so that rare names and my own jargon come out right.
11. As the owner, I want a word added to the Dictionary to take effect on the next Recording without restarting anything, so that fixing a spelling is quick.
12. As the owner, I want the Dictionary to stay on my Mac and out of the public repository, so that my word list is private.
13. As the owner, I want the repository to contain an example Dictionary, so that the format is clear without exposing mine.
14. As a Client, I want to send hints with a Recording (words likely to occur in it), so that the Transcript is more accurate for the current subject.
15. As the owner, I want a test page where I can record a phrase and see its Transcript and the time it took, so that I can check Kobzar without any other Client.
16. As the owner, I want to save a phrase from the test page as one of the Samples together with the text it should produce, so that I build a set of my own real speech.
17. As the owner, I want to run all Samples with one action and see, for each, the Transcript beside the expected text, the differences and the time, so that I can judge speed and accuracy.
18. As the owner, I want to edit the expected text of a Sample and to delete a Sample, so that mistakes in the set can be fixed.
19. As the owner, I want my voice to be stored only when I save a Sample myself, so that nothing is recorded behind my back.
20. As the owner, I want the saved audio of Samples to stay out of the repository, so that my voice is never published.
21. As the owner, I want every other Recording to be discarded as soon as its Transcript is returned, so that Kobzar keeps no history.
22. As the owner, I want all recognition to happen on my Mac, so that my voice never goes to a third party.
23. As the owner, I want Kobzar to be reachable only from my own devices over the private network, so that no one else can use it.
24. As the owner, I want to decide which sites may send Recordings to Kobzar from a browser, so that an arbitrary web page cannot use it.
25. As the owner, I want to start Kobzar with a single command, so that running it is not a chore.
26. As a Client, I want to find out whether Kobzar is available before offering dictation, so that I can show an honest state.
27. As a Client, I want a clear error when a Recording cannot be transcribed (too long, unreadable, Kobzar busy or failing), so that I can tell the owner what happened and offer to try again.
28. As the owner, I want a Recording longer than five minutes to be refused with a clear message, so that a forgotten recording does not tie up the service.
29. As the owner, I want a second Recording sent while the first is being processed to wait its turn rather than fail, so that two devices do not break each other.
30. As a future Client, I want to be able to ask for a processing mode with a Recording, so that cleaned-up text can be added later without changing how Clients talk to Kobzar.

## Requirements

### Functional

1. Kobzar accepts one Recording per request and returns one Transcript for it.
2. The Transcript is in the language spoken. Kobzar supports Russian and English; Russian is assumed unless the Client asks for English. Kobzar does not detect the language by itself and does not translate.
3. The default language is a setting of Kobzar.
4. The Transcript carries punctuation and capital letters and is otherwise verbatim: nothing is rephrased, summarised or corrected.
5. English terms spoken inside Russian speech are written in Latin letters in their correct form when they are in the Dictionary or in the Client's hints.
6. A Recording that contains no speech produces an empty Transcript. Phrases that the model is known to invent on silence are not returned.
7. The Dictionary is a list of words kept on the Mac and edited by the owner by hand. A change applies to the next Recording without a restart.
8. A Client may send hints with a Recording; they are used for that Recording only, together with the Dictionary.
9. A Client may name a processing mode with a Recording. The MVP supports only the verbatim mode and refuses any other with a clear error.
10. A Recording longer than five minutes is refused with a clear error.
11. Recordings are processed one at a time; a Recording that arrives while another is being processed waits.
12. Kobzar reports to a Client whether it is available and ready to transcribe.
13. Every failure is returned to the Client as an explicit error that says what went wrong.
14. Kobzar discards each Recording and its Transcript once the Transcript has been returned. The only stored audio is that of Samples.
15. The test page lets the owner record a phrase, choose the language, see the Transcript and the time taken.
16. The test page lets the owner save the phrase just recorded as a Sample by entering the expected text, edit the expected text of a Sample, and delete a Sample.
17. One action runs Kobzar over all Samples and shows for each: the Transcript, the expected text, the differences between them and the time taken, plus totals for the whole run.
18. Kobzar answers browser requests only from the sites listed in its settings; its own test page is always allowed.
19. Kobzar starts with a single command and is ready to transcribe without further steps.

### Non-functional

- **Privacy:** recognition runs entirely on the Mac; no Recording, Transcript, Dictionary or Sample is sent to any outside service. The internet is needed only to obtain the model once.
- **Speed:** on the owner's MacBook (M5 Pro, 48 GB) a thirty-second Recording should come back in about three seconds; the real figure is measured with the Samples.
- **Accuracy:** judged by the owner on the Samples; words in the Dictionary should be right in roughly nine cases out of ten.
- **Platforms:** Kobzar runs on the owner's personal MacBook. The test page works in Chrome and Safari on the iPhone and on the Mac.
- **Security:** Kobzar listens on the local machine only unless told otherwise and is reached from the phone through the private network, which also provides HTTPS. There is no authentication in Kobzar itself.
- **Availability:** Kobzar works only while the Mac is on, awake and reachable. Nothing is queued for later.

## Constraints

- Kobzar is developed and run only on the owner's personal MacBook. The work laptop takes no part: it must not have Tailscale, and without HTTPS a phone browser will not record from the microphone.
- Kobzar must never be exposed on a public interface or through a public tunnel.
- The repository is public. The owner's Dictionary and the audio of Samples must not be committed to it.
- Kobzar is a personal, single-user tool.
- A browser records from the microphone only on an HTTPS page; every browser Client depends on that.

## Out of Scope

- Text appearing live while the owner is still speaking.
- Translation.
- Cleaning the text with a language model (removing filler words and repetitions, fixing slips of the tongue).
- Training or tuning the model on the owner's voice.
- Growing the Dictionary automatically from the owner's corrections.
- An iOS Shortcut, a native iOS keyboard, dictation on the Mac itself, any cross-platform app.
- A history of Transcripts.
- Starting Kobzar automatically at login.
- Languages other than Russian and English, including Ukrainian words mixed into Russian speech.
- A screen for editing the Dictionary.
- Accounts, logins or use by anyone but the owner.

## Open Questions

- Which speech recognition model and which way of running it give the best accuracy and speed on the owner's speech: to be answered in the plan and confirmed with the Samples (owner and the plan's author).
- Whether the expected texts of Samples may live in the public repository or should stay local together with the audio (owner).
- How many Samples are enough to trust a run; the working number is twenty to thirty phrases (owner, after the first runs).

## Further Notes

- The first real Client is the microphone button in the Dojo, specified separately in `../../../dojo/features/voice-input/SPEC.md`. Together the two make up the owner's MVP: Kobzar first, the button second.
- Whisper is the model family the owner had in mind and the usual choice for local recognition; the SPEC does not fix it.
- The Samples, a saved Recording with the correct text for each, are exactly the material a later tuning of the model on the owner's voice would need, so collecting them now keeps that path open.
- The names considered and dropped for this project (Pysar, and a set of kobzar-guild words for its parts) are listed under _Avoid_ in the glossary.
