# Listening lessons (`content/listening/*.json`): license and credits

These files define the app's *Audītiō* lessons. They combine material from
**Dickinson College Commentaries** (DCC, https://dcc.dickinson.edu) with original writing
for this app. No textbook (Wheelock) text is included: words the learner already knows
are referred to only by the app's lemma ids, and their glosses come from the learner's
own private content pack at run time.

## License

The files are an adaptation of DCC material and are shared under the same license:
**Creative Commons Attribution-ShareAlike (CC BY-SA)**. DCC's record pages say
"License: Attribution-ShareAlike" and "Audio Credit: DCC"; its terms of use
(https://dcc.dickinson.edu/terms-use) say the content "is licensed under a Creative Commons
Attribution-ShareAlike License" without naming a version (DCC's other material, such as the
Latin Core Vocabulary, is CC BY-SA 3.0). License text: https://creativecommons.org/licenses/by-sa/3.0/

## What comes from DCC

- **Latin text** of the transcripts (`transcript`), as printed on DCC, with DCC's macrons:
  - *Navigatio Sancti Brendani* 1.1–5 and 10.1–7, DCC edition by William Turpin
    (https://dcc.dickinson.edu/navigatio-brendani).
  - Jerome, *Vita Malchi* 7, as printed on the DCC record page
    https://dcc.dickinson.edu/podcasts/jerome-vita-malchi-7-read-aloud-cf.
  - *Elegiac Romulus* 2, *De lupo et agno*, DCC edition
    (https://dcc.dickinson.edu/elegiac-romulus/2-de-lupo-et-agno).
- **Audio** (referenced by `audio.key`; the clip itself is served by the app's server, not
  stored in this repository). Changes: re-encoded to mono MP3, 22.05 kHz, 48 kbps; not cut.
  - "Navigatio Brendani 1.1-5 read by Christopher Francese", read by **Christopher Francese**,
    https://dcc.dickinson.edu/podcasts/navigatio-sancti-brendani-1-1-5
  - "Navigatio Brendani 10.1-7 read by Christopher Francese", read by **Christopher Francese**,
    https://dcc.dickinson.edu/podcasts/navigatio-brendani-10-1-7-read-christopher-francese
  - "Jerome Vita Malchi 7 read aloud (CF)", read by **Christopher Francese**,
    https://dcc.dickinson.edu/podcasts/jerome-vita-malchi-7-read-aloud-cf
  - "De Lupo et Agno read by Wanzie Li", read by **Wanzie Li**,
    https://dcc.dickinson.edu/podcasts/de-lupo-et-agno-read-wanzie-li

Each lesson file repeats its recording's credit in `audio.attribution`, and the app shows it on
the listening screens and in Profile → About & credits.

## What is original

The English context lines, the "where to listen" hints, the glosses of words not yet taught
(`vocab`, `notes`), the token annotations and the comprehension questions were written for
this app. They are released under the same CC BY-SA license as the DCC material they accompany.
