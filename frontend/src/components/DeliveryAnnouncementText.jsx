export default function DeliveryAnnouncementText({ announcement }) {
  if (!announcement) return null;
  return <>
    <p className="mt-1 mb-0 wrap-break-word text-xs font-bold text-ink-700">{announcement.title}</p>
    <p className="mt-1 mb-0 wrap-break-word whitespace-pre-wrap text-xs leading-5 text-slate-600">{announcement.message}</p>
  </>;
}
