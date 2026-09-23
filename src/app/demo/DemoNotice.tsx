"use client";

import { resetDemoAction } from "./actions";

export function DemoNotice() {
  return (
    <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm text-sand">
      <span>דמו ציבורי משותף · הנתונים מתאפסים בערך כל שעה</span>
      <form
        action={resetDemoAction}
        onSubmit={(event) => {
          if (!window.confirm("לאפס את הדמו ולהחזיר את כל הנתונים למצב ההתחלתי?")) {
            event.preventDefault();
          }
        }}
      >
        <button type="submit" className="shrink-0 rounded-lg border border-line-strong px-3 py-2 font-semibold text-cream hover:bg-card-2">
          איפוס הדמו
        </button>
      </form>
    </div>
  );
}
