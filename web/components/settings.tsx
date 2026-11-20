"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getDefaultGoal,
  getGoals,
  getSettings,
  putDefaultGoal,
  putSettings,
  type Goal,
} from "@/lib/api";
import { fmt, percent, shortDay, sinceDay } from "@/lib/format";
import { carbsRemainder, goalShares, proteinFatKcal, wholeNumber, type GoalInput } from "@/lib/goals";
import { inputField, kicker, primaryOff } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { MacroLine } from "@/components/macro-line";
import { Segmented } from "@/components/segmented";

const TOLERANCES = [0.05, 0.1, 0.15, 0.2];

const FIELDS = [
  { key: "kcal", label: "Kalorien", unit: "kcal", color: null },
  { key: "protein", label: "Eiweiß", unit: "g", color: "var(--biss-prot)" },
  { key: "fat", label: "Fett", unit: "g", color: "var(--biss-fat)" },
] as const;

type Texts = Record<keyof GoalInput, string>;
const textsOf = (goal: GoalInput): Texts => ({
  kcal: String(Math.round(goal.kcal)),
  protein: String(Math.round(goal.protein)),
  fat: String(Math.round(goal.fat)),
});

/**
 * Goals typed but not saved, kept while the app is open: switching the tab or the back
 * button unmounts the page, and the typing was lost without a word.
 */
let keptDraft: Texts | null = null;

/**
 * The tab Einstellungen (SPEC 3, ADR-0015): the goals from today, the tolerance of the
 * statistics and the goals so far. Kalorien, Eiweiß and Fett are typed, the carbs are the
 * remainder; the preview is local and display only, the backend computes when saving.
 */
export function Settings({
  today,
  show,
  onError,
  onGoalChanged,
}: {
  today: string;
  /** The toast, with "Rückgängig" when an undo is given. */
  show: (text: string, onUndo?: () => void) => void;
  onError: (failure: unknown) => void;
  /** Today's goal changed: the day summary loads again. */
  onGoalChanged: () => void;
}) {
  const [current, setCurrent] = useState<Goal | null>(null);
  const [history, setHistory] = useState<Goal[]>([]);
  const [tolerance, setTolerance] = useState<number | null>(null);
  const [texts, setTexts] = useState<Texts | null>(() => keptDraft);
  useEffect(() => {
    keptDraft = texts;
  }, [texts]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([getDefaultGoal(), getGoals()]).then(([goal, goals]) => {
        setCurrent(goal);
        setHistory(goals);
        setTexts(null);
      }),
    [],
  );
  useEffect(() => {
    let live = true;
    Promise.all([getDefaultGoal(), getGoals(), getSettings()]).then(
      ([goal, goals, settings]) => {
        if (!live) return;
        setCurrent(goal);
        setHistory(goals);
        setTolerance(settings.tolerance);
      },
      (failure) => live && onError(failure),
    );
    return () => {
      live = false;
    };
  }, [onError]);

  const shown = texts ?? (current ? textsOf(current) : null);
  const draft = shown && {
    kcal: wholeNumber(shown.kcal),
    protein: wholeNumber(shown.protein),
    fat: wholeNumber(shown.fat),
  };
  const complete = draft && draft.kcal !== null && draft.protein !== null && draft.fat !== null ? (draft as GoalInput) : null;
  const changed = !!current && !!complete && (["kcal", "protein", "fat"] as const).some((key) => complete[key] !== Math.round(current[key]));
  const dirty = texts !== null && current !== null && (changed || !complete);
  const carbs = complete ? carbsRemainder(complete) : null;
  const tooMuch = carbs !== null && carbs < 0;
  const shares = complete && !tooMuch ? goalShares(complete) : null;

  const save = async () => {
    if (!complete || !current) return;
    const before = { kcal: current.kcal, protein: current.protein, fat: current.fat };
    setBusy(true);
    try {
      await putDefaultGoal(complete);
      await load();
      onGoalChanged();
      // Undo puts the goal from before back, again from today.
      show("Neue Ziele gelten ab heute", () => {
        putDefaultGoal(before)
          .then(load)
          .then(onGoalChanged)
          .catch(onError);
      });
    } catch (failure) {
      onError(failure);
    } finally {
      setBusy(false);
    }
  };

  const changeTolerance = (next: number) => {
    const before = tolerance;
    setTolerance(next);
    putSettings({ tolerance: next }).then(
      () =>
        show(`Toleranz ±${percent(next)} gespeichert`, () => {
          if (before === null) return;
          setTolerance(before);
          putSettings({ tolerance: before }).catch(onError);
        }),
      (failure) => {
        setTolerance(before);
        onError(failure);
      },
    );
  };

  return (
    <div className="grid">
      <section aria-label="Tagesziele" className="grid gap-2.5 pb-[13px]">
        <span className={kicker}>Tagesziele</span>
        {shown &&
          FIELDS.map(({ key, label, unit, color }) => (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-2.5">
              <label htmlFor={`goal-${key}`} className="flex items-center text-[14.5px] font-semibold">
                {color && <i aria-hidden="true" className="mr-2 inline-block size-2 rounded-full" style={{ background: color }} />}
                {label}
              </label>
              <span className="relative">
                <input
                  id={`goal-${key}`}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={wholeNumber(shown[key]) === null || undefined}
                  value={shown[key]}
                  onChange={(event) => setTexts({ ...shown, [key]: event.target.value })}
                  className={cn(inputField, "pr-11 text-right font-semibold tabular-nums aria-invalid:border-warn")}
                />
                <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-muted-foreground">
                  {unit}
                </span>
              </span>
            </div>
          ))}
        {shown && (
          <div data-testid="goal-carbs" className="grid grid-cols-[minmax(0,1fr)_132px] items-center gap-2.5 text-[14.5px]">
            <span className="flex items-center font-semibold">
              <i aria-hidden="true" className="mr-2 inline-block size-2 rounded-full bg-carb" />
              Kohlenhydrate
            </span>
            <span className="pr-3 text-right font-semibold tabular-nums">
              {carbs === null ? "–" : `${fmt(Math.max(carbs, 0))} g`}
            </span>
          </div>
        )}
        {shares && (
          <div className="grid gap-1">
            <div aria-hidden="true" className="flex h-[7px] overflow-hidden rounded-[4px]">
              <i style={{ width: `${shares.widths.protein * 100}%`, background: "var(--biss-prot)" }} />
              <i style={{ width: `${shares.widths.carbs * 100}%`, background: "var(--biss-carb)" }} />
              <i style={{ width: `${shares.widths.fat * 100}%`, background: "var(--biss-fat)" }} />
            </div>
            <span data-testid="goal-shares" className="text-[12.5px] text-muted-foreground tabular-nums">
              {`E ${shares.labels.protein} % · K ${shares.labels.carbs} % · F ${shares.labels.fat} %`}
            </span>
          </div>
        )}
        {tooMuch && complete && (
          <p role="alert" className="text-[13px] font-semibold text-warn">
            {`Eiweiß und Fett ergeben schon ${fmt(proteinFatKcal(complete))} kcal.`}
          </p>
        )}
        {!dirty && current?.valid_from && (
          <p className="text-[13px] text-muted-foreground">{`Gilt ${sinceDay(current.valid_from, today)}.`}</p>
        )}
      </section>

      <section aria-label="Toleranz" className="grid gap-2 border-t py-[13px]">
        <span className={kicker}>Toleranz</span>
        {tolerance !== null && (
          <Segmented
            label="Toleranz"
            options={TOLERANCES.map((value) => ({ value, label: `±${percent(value)}` }))}
            value={TOLERANCES.reduce((a, b) => (Math.abs(b - tolerance) < Math.abs(a - tolerance) ? b : a))}
            onChange={changeTolerance}
          />
        )}
        <p className="text-[13px] text-muted-foreground">
          So weit darf ein Tag vom Ziel abweichen und zählt in der Statistik noch als im Zielbereich. Gilt für alle Tage.
        </p>
      </section>

      <section aria-label="Bisherige Ziele" className="grid gap-2 border-t py-[13px]">
        <span className={kicker}>Bisherige Ziele</span>
        <ul className="grid gap-2">
          {history.map((goal) => (
            <li key={goal.valid_from ?? "start"} className="grid gap-px text-[13px] tabular-nums">
              <span className="flex flex-wrap items-center gap-x-2 font-semibold">
                {`${fmt(goal.kcal)} kcal`}
                <MacroLine macros={goal} />
              </span>
              <span className="text-muted-foreground">{goal.valid_from ? sinceDay(goal.valid_from, today) : "von Anfang an"}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Sticky footer like the food editor's, only for a change: the fields scroll above it. */}
      {dirty && (
        <div
          data-testid="settings-footer"
          className="sticky bottom-0 z-10 -mx-5 -mb-3 border-t bg-card px-5 pt-3 pb-3"
        >
          <p className="mb-2.5 text-[13px] text-muted-foreground">
            {`Gilt ab heute, ${shortDay(today)}. Frühere Tage behalten ihre Ziele.`}
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => setTexts(null)}
              className="h-[54px] rounded-2xl border px-[18px] font-semibold text-muted-foreground"
            >
              Verwerfen
            </button>
            <button
              type="button"
              disabled={busy || !changed || tooMuch}
              onClick={save}
              className={cn("h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground", primaryOff)}
            >
              Ab heute übernehmen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
