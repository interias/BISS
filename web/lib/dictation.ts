// The part of the Web Speech API the dictation uses (ADR-0013, as in KORB); lib.dom does not
// ship its types.
export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type Constructor = new () => Recognition;

function constructor(): Constructor | undefined {
  const scope = window as unknown as { SpeechRecognition?: Constructor; webkitSpeechRecognition?: Constructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Whether the browser can recognise speech; without it there is no button. */
export const canDictate = () => !!constructor();

export function newRecognition(): Recognition {
  const recognition = new (constructor() as Constructor)();
  recognition.lang = "de-DE";
  recognition.interimResults = true;
  recognition.continuous = true;
  return recognition;
}

/**
 * Collects what a recognition hears into one sentence: the final parts so far, then the
 * part still being heard. `resultIndex` is the first result that changed, as in the browser.
 */
export function transcript() {
  let final = "";
  let interim = "";
  return {
    hear(event: RecognitionResultEvent) {
      interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const part = event.results[i];
        // Separate the parts: some engines send them without a leading space.
        if (part.isFinal) final += ` ${part[0].transcript}`;
        else interim += ` ${part[0].transcript}`;
      }
      return this.sentence();
    },
    sentence: () => `${final} ${interim}`.replace(/\s+/g, " ").trim(),
  };
}
