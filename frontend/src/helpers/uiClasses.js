export const pageClass = "mx-auto grid w-full max-w-[1440px] gap-4 px-6 py-5 max-[720px]:gap-4 max-[720px]:px-3.5 max-[720px]:py-[18px]";

export const pageHeaderClass = "flex flex-wrap items-start justify-between gap-4 [&_h1]:m-0 [&_h1]:text-[21px] [&_h1]:font-bold [&_h1]:text-ink-950 max-[720px]:[&_h1]:text-[19px] [&_p]:mt-[5px] [&_p]:mb-0 [&_p]:text-sm [&_p]:text-slate-500";

export const panelClass = "grid content-start gap-[15px] rounded-md border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,21,31,0.04)]";

export const tablePanelClass = "overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,21,31,0.04)] [&_table]:min-w-[720px] [&_thead_tr]:h-9 [&_tbody_tr]:h-11 [&_td]:px-3.5 [&_td]:py-1.5 [&_td]:text-[13px] [&_th]:px-3.5 [&_th]:py-2 [&_th]:text-xs";

export const tableScrollClass = "w-full overflow-x-auto";

export const tableHeadingClass = "flex min-h-[58px] items-start justify-between gap-4 border-b border-slate-200 px-4 py-3 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink-950 [&_p]:mt-[3px] [&_p]:mb-0 [&_p]:text-xs [&_p]:text-slate-500";

export const secondaryButtonClass = "mr-auto border-slate-300 bg-white text-ink-700 hover:border-[#adb5bf] hover:bg-slate-100 hover:text-ink-950 max-[720px]:mr-0";

export const tableActionButtonClass = "min-h-8 px-2.75 text-xs";

export const dangerButtonClass = "border-critical-600 bg-critical-600 hover:border-[#991b1b] hover:bg-[#991b1b]";

export const alertClasses = {
  success: "rounded-[5px] border border-[#bbf7d0] bg-positive-50 px-3.5 py-3 text-[13px] font-semibold text-[#166534]",
  error: "rounded-[5px] border border-[#fecaca] bg-critical-50 px-3.5 py-3 text-[13px] font-semibold text-[#991b1b]",
  warning: "rounded-[5px] border border-[#fed7aa] bg-rust-50 px-3.5 py-3 text-[13px] font-semibold text-[#92400e]",
};

const badgeBase = "status-badge relative inline-flex min-h-[27px] items-center rounded-[2px] py-0 pr-[9px] pl-[13px] font-mono text-[11px] font-bold uppercase before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-current";

const badgeTones = {
  success: "bg-positive-50 text-positive-600",
  info: "bg-sky-50 text-sky-700",
  warning: "bg-rust-50 text-rust-600",
  critical: "bg-critical-50 text-critical-600",
  neutral: "bg-slate-100 text-ink-700",
};

export function badgeClass(tone = "neutral") {
  return `${badgeBase} ${badgeTones[tone] || badgeTones.neutral}`;
}

export const metricCardClass = "grid min-h-[146px] grid-cols-[1fr_auto] content-between gap-[7px] rounded-md border border-slate-200 bg-white p-[18px] shadow-[0_1px_2px_rgba(16,21,31,0.04)] [&>strong]:self-end [&>strong]:font-mono [&>strong]:text-[28px] [&>strong]:text-ink-950 [&>span:last-child]:col-span-full [&>span:last-child]:text-xs [&>span:last-child]:font-semibold [&>span:last-child]:text-slate-500";

export const metricIconClasses = {
  neutral: "col-start-2 row-span-2 inline-flex size-[38px] items-center justify-center rounded-[5px] bg-slate-100 text-ink-700",
  warning: "col-start-2 row-span-2 inline-flex size-[38px] items-center justify-center rounded-[5px] bg-rust-50 text-rust-600",
  positive: "col-start-2 row-span-2 inline-flex size-[38px] items-center justify-center rounded-[5px] bg-positive-50 text-positive-600",
};

export const dashboardPanelClass = "min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,21,31,0.04)]";

export const dashboardPanelHeadingClass = "flex items-start justify-between gap-3.5 border-b border-slate-200 px-[18px] py-[17px] [&_h2]:m-0 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-ink-950 [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-xs [&_p]:text-slate-500";

export const panelCountClass = "inline-flex min-h-[27px] min-w-[29px] items-center justify-center rounded bg-slate-100 font-mono text-xs font-bold text-ink-700";

export const dashboardListRowClass = "flex items-center justify-between gap-4 border-b border-slate-200 px-[18px] py-[13px] last:border-b-0 max-[720px]:items-start [&>div]:grid [&>div]:min-w-0 [&>div]:gap-1 [&>div>strong]:overflow-hidden [&>div>strong]:text-ellipsis [&>div>strong]:whitespace-nowrap [&>div>strong]:text-[13px] [&>div>strong]:text-ink-950 [&>div>span:not([class*='status'])]:overflow-hidden [&>div>span:not([class*='status'])]:text-ellipsis [&>div>span:not([class*='status'])]:whitespace-nowrap [&>div>span:not([class*='status'])]:text-[11px] [&>div>span:not([class*='status'])]:text-slate-500";

export const listRowEndClass = "shrink-0 justify-items-end text-right [&>strong]:font-mono";

export const emptyStateClass = "m-0 px-[18px] py-[34px] text-center text-[13px] text-slate-500";

export const numericCellClass = "font-mono font-semibold text-ink-950";
export const codeCellClass = "font-mono text-xs font-semibold text-ink-950";
export const dateCellClass = "whitespace-nowrap text-xs text-slate-600";
export const emptyTableCellClass = "h-24 text-center text-slate-500";

export const formActionsClass = "flex flex-wrap items-center justify-end gap-3 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:[&>*]:w-full";
