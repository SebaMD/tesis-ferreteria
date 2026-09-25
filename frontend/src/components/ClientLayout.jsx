import ClientNavbar from "./ClientNavbar.jsx";

export default function ClientLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8f9]">
      <ClientNavbar />
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="mt-12 border-t border-slate-200 bg-white px-6 py-7 text-center text-xs text-slate-500">
        FERRETERIA FYF · Tienda online
      </footer>
    </div>
  );
}
