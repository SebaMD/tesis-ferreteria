import {
  AlertTriangle,
  ChevronDown,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import DeliveryLocationPicker from "../components/DeliveryLocationPicker.jsx";
import EmailVerificationPanel from "../components/EmailVerificationPanel.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { DELIVERY_COMMUNE, normalizeDeliveryCoordinates } from "../helpers/delivery.js";
import { normalizeChileanMobilePhone } from "../helpers/phone.js";
import useAuth from "../hooks/useAuth.js";
import {
  requestClientEmailChange,
  verifyClientEmailChange,
} from "../services/emailVerification.service.js";
import {
  deleteClientDeliveryAddressRequest,
  getClientDeliveryAddressRequest,
  saveClientDeliveryAddressRequest,
} from "../services/onlineOrders.service.js";
import { updateMyClientProfileRequest } from "../services/users.service.js";

function emptyAddress(user) {
  return {
    recipientName: `${user?.names || ""} ${user?.surnames || ""}`.trim(),
    phone: user?.phone || "",
    address: "",
    commune: DELIVERY_COMMUNE,
    reference: "",
    latitude: null,
    longitude: null,
  };
}

function AccordionSection({ id, title, Icon, open, onToggle, children }) {
  return (
    <section className="client-account-section overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        className="client-account-trigger flex min-h-15 w-full items-center gap-3 rounded-none border-0 bg-white px-5 py-4 text-left text-ink-950 hover:bg-slate-50 max-[520px]:px-4"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rust-50 text-rust-600"><Icon size={18} /></span>
        <strong className="flex-1 text-base">{title}</strong>
        <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} size={19} />
      </button>
      {open && <div className="border-t border-slate-200 p-5 max-[520px]:p-4" id={id}>{children}</div>}
    </section>
  );
}

export default function ClientAccountPage() {
  const { user, replaceSession } = useAuth();
  const [profileOpen, setProfileOpen] = useState(true);
  const [addressOpen, setAddressOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changeEmail, setChangeEmail] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState(user.phone || "");
  const [savingPhone, setSavingPhone] = useState(false);
  const [savedAddress, setSavedAddress] = useState(null);
  const [addressForm, setAddressForm] = useState(() => emptyAddress(user));
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressLoading, setAddressLoading] = useState(true);
  const [savingAddress, setSavingAddress] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    getClientDeliveryAddressRequest()
      .then((data) => {
        if (!active || !data) return;
        setSavedAddress(data);
        setAddressForm({ ...data, reference: data.reference || "" });
      })
      .catch((error) => { if (active) toast.error(getApiError(error, "No se pudo cargar tu dirección")); })
      .finally(() => { if (active) setAddressLoading(false); });
    return () => { active = false; };
  }, []);

  const savePhone = async (event) => {
    event.preventDefault();
    const normalized = phone.trim() ? normalizeChileanMobilePhone(phone) : null;
    if (phone.trim() && !normalized) {
      toast.error("Ingresa un teléfono móvil chileno válido. Ejemplo: +56912345678");
      return;
    }
    setSavingPhone(true);
    try {
      const session = await updateMyClientProfileRequest({ phone: normalized });
      replaceSession(session);
      setPhone(session.user.phone || "");
      setEditingPhone(false);
      toast.success("Teléfono actualizado");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo actualizar el teléfono"));
    } finally {
      setSavingPhone(false);
    }
  };

  const updateAddress = (field, value) => setAddressForm((current) => ({ ...current, [field]: value }));

  const saveAddress = async (event) => {
    event.preventDefault();
    const recipientName = addressForm.recipientName.trim().replace(/\s+/g, " ");
    const normalizedPhone = normalizeChileanMobilePhone(addressForm.phone);
    const address = addressForm.address.trim().replace(/\s+/g, " ");
    const coordinates = normalizeDeliveryCoordinates(addressForm.latitude, addressForm.longitude);
    const hasAnyCoordinate = addressForm.latitude !== null || addressForm.longitude !== null;
    if (recipientName.length < 3) return toast.error("Ingresa el nombre completo del destinatario");
    if (!normalizedPhone) return toast.error("Ingresa un teléfono móvil chileno válido");
    if (!address) return toast.error("Ingresa una dirección");
    if (hasAnyCoordinate && !coordinates) return toast.error("El punto de entrega no contiene coordenadas válidas");

    setSavingAddress(true);
    try {
      const saved = await saveClientDeliveryAddressRequest({
        recipientName,
        phone: normalizedPhone,
        address,
        commune: DELIVERY_COMMUNE,
        reference: addressForm.reference.trim().replace(/\s+/g, " ") || null,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      });
      setSavedAddress(saved);
      setAddressForm({ ...saved, reference: saved.reference || "" });
      setEditingAddress(false);
      setConfirmDelete(false);
      toast.success("Dirección guardada");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo guardar la dirección"));
    } finally {
      setSavingAddress(false);
    }
  };

  const deleteAddress = async () => {
    setSavingAddress(true);
    try {
      await deleteClientDeliveryAddressRequest();
      setSavedAddress(null);
      setAddressForm(emptyAddress(user));
      setEditingAddress(false);
      setConfirmDelete(false);
      toast.success("Dirección eliminada");
    } catch (error) {
      toast.error(getApiError(error, "No se pudo eliminar la dirección"));
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <main className="relative mx-auto grid w-full max-w-220 gap-5 px-6 py-8 max-[720px]:px-3.5">
      <LoadingOverlay active={addressLoading} />
      <div>
        <h1 className="m-0 text-2xl font-bold text-ink-950">Mi cuenta</h1>
        <p className="mt-1.5 mb-0 text-sm text-slate-500">Administra tus datos y preferencias para próximas compras.</p>
      </div>

      {!user.emailVerifiedAt && !user.emailVerified && (
        <section className="flex items-center justify-between gap-4 rounded-lg border-2 border-rust-300 bg-rust-50 p-5 max-[620px]:grid">
          <div className="flex min-w-0 items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-rust-600" size={22} /><div><strong className="block text-sm text-ink-950">Tu correo todavía está pendiente de verificación</strong><p className="mt-1 mb-0 text-xs leading-5 text-rust-800">Verifícalo una sola vez para poder iniciar una compra.</p></div></div>
          <Link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[5px] border border-rust-600 bg-rust-600 px-4 text-sm font-bold text-white no-underline hover:bg-rust-700" to="/verify-email">Verificar correo ahora</Link>
        </section>
      )}

      <AccordionSection id="client-profile-section" title="Mi perfil" Icon={UserRound} open={profileOpen} onToggle={() => setProfileOpen((current) => !current)}>
        <div className="grid gap-5">
          <div className="flex items-center gap-4 border-b border-slate-200 pb-5"><span className="grid size-14 place-items-center rounded-full bg-rust-50 text-rust-600"><UserRound size={27} /></span><div><strong className="block text-lg text-ink-950">{user.names} {user.surnames}</strong><span className="text-xs font-bold text-positive-600">Cuenta activa</span></div></div>
          <dl className="grid grid-cols-2 gap-4 max-[620px]:grid-cols-1">
            <div className="client-account-surface rounded-[5px] bg-slate-50 p-4"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><ShieldCheck size={16} /> RUT</dt><dd className="mt-2 ml-0 font-semibold text-ink-950">{user.rut}</dd></div>
            <div className="client-account-surface rounded-[5px] bg-slate-50 p-4"><dt className="flex items-center gap-2 text-xs font-bold text-slate-500"><Mail size={16} /> Correo</dt><dd className="mt-2 ml-0 break-all font-semibold text-ink-950">{user.correo}</dd><span className={`mt-1 block text-xs font-bold ${user.emailVerifiedAt || user.emailVerified ? "text-positive-600" : "text-amber-700"}`}>{user.emailVerifiedAt || user.emailVerified ? "Correo verificado" : "Correo pendiente de verificación"}</span></div>
            <div className="client-account-surface rounded-[5px] bg-slate-50 p-4">
              <dt className="flex items-center justify-between gap-2 text-xs font-bold text-slate-500"><span className="flex items-center gap-2"><Phone size={16} /> Teléfono</span>{!editingPhone && <button className="size-9 min-h-9 border-slate-300 bg-white p-0 text-ink-700" type="button" onClick={() => setEditingPhone(true)} aria-label="Editar teléfono"><Pencil size={15} /></button>}</dt>
              {editingPhone ? <form className="mt-3 grid gap-2" onSubmit={savePhone}><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+56912345678" autoComplete="tel" /><div className="flex gap-2"><button type="submit" disabled={savingPhone}><Save size={15} /> Guardar</button><button className="border-slate-300 bg-white text-ink-700" type="button" disabled={savingPhone} onClick={() => { setPhone(user.phone || ""); setEditingPhone(false); }}><X size={15} /> Cancelar</button></div></form> : <dd className="mt-2 ml-0 font-semibold text-ink-950">{user.phone || "No registrado"}</dd>}
            </div>
            <div className="client-account-surface rounded-[5px] bg-slate-50 p-4"><dt className="text-xs font-bold text-slate-500">Apariencia</dt><dd className="mt-2 ml-0"><ThemeToggle showLabel /></dd><span className="mt-2 block text-xs text-slate-500">Se guarda para esta cuenta en este navegador.</span></div>
          </dl>
          <section className="grid gap-3 border-t border-slate-200 pt-5"><div><h2 className="m-0 text-base font-bold text-ink-950">Cambiar correo</h2><p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Tu correo actual se mantendrá hasta que verifiques el nuevo.</p></div>{!changeEmail ? <form className="flex items-end gap-2 max-[620px]:grid" onSubmit={(event) => { event.preventDefault(); setChangeEmail(newEmail.trim().toLowerCase()); }}><label className="grid min-w-0 flex-1 gap-1.5 text-xs font-bold text-slate-600">Nuevo correo electrónico<input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required /></label><button type="submit" disabled={!newEmail.trim()}>Continuar</button></form> : <div className="grid gap-3"><EmailVerificationPanel key={changeEmail} email={changeEmail} requestCode={() => requestClientEmailChange(changeEmail)} verifyCode={verifyClientEmailChange} onVerified={(session) => { replaceSession(session); setNewEmail(""); setChangeEmail(""); }} title="Verifica el nuevo correo" description="El cambio se aplicará únicamente después de ingresar el código correcto." /><button className="w-fit border-slate-300 bg-white text-ink-700 hover:bg-slate-100" type="button" onClick={() => setChangeEmail("")}>Cancelar cambio</button></div>}</section>
        </div>
      </AccordionSection>

      <AccordionSection id="client-address-section" title="Mi dirección" Icon={MapPin} open={addressOpen} onToggle={() => setAddressOpen((current) => !current)}>
        {editingAddress ? (
          <form className="grid gap-4" onSubmit={saveAddress}>
            <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1"><label>Nombre del destinatario<input maxLength="240" value={addressForm.recipientName} onChange={(event) => updateAddress("recipientName", event.target.value)} required /></label><label>Teléfono de contacto<input maxLength="20" value={addressForm.phone} onChange={(event) => updateAddress("phone", event.target.value)} placeholder="+56912345678" required /></label><label>Dirección<input maxLength="300" value={addressForm.address} onChange={(event) => updateAddress("address", event.target.value)} required /></label><label>Comuna<input readOnly value={DELIVERY_COMMUNE} aria-readonly="true" /></label><label className="col-span-2 max-[620px]:col-span-1">Referencia (opcional)<textarea className="min-h-20 w-full resize-y rounded-[5px] border border-slate-300 bg-white px-2.75 py-2 text-ink-950" maxLength="500" value={addressForm.reference} onChange={(event) => updateAddress("reference", event.target.value)} /></label><DeliveryLocationPicker latitude={addressForm.latitude} longitude={addressForm.longitude} address={addressForm.address} commune={DELIVERY_COMMUNE} onChange={({ latitude, longitude }) => setAddressForm((current) => ({ ...current, latitude, longitude }))} disabled={savingAddress} /></div>
            <div className="flex flex-wrap gap-2"><button type="submit" disabled={savingAddress}><Save size={16} /> Guardar dirección</button><button className="border-slate-300 bg-white text-ink-700" type="button" disabled={savingAddress} onClick={() => { setAddressForm(savedAddress ? { ...savedAddress, reference: savedAddress.reference || "" } : emptyAddress(user)); setEditingAddress(false); }}><X size={16} /> Cancelar</button></div>
          </form>
        ) : savedAddress ? (
          <div className="grid gap-4"><dl className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1"><div className="client-account-surface rounded-md bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Destinatario</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{savedAddress.recipientName}</dd></div><div className="client-account-surface rounded-md bg-slate-50 p-3"><dt className="text-xs font-bold text-slate-500">Teléfono</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{savedAddress.phone}</dd></div><div className="client-account-surface col-span-2 rounded-md bg-slate-50 p-3 max-[620px]:col-span-1"><dt className="text-xs font-bold text-slate-500">Dirección</dt><dd className="mt-1 ml-0 font-semibold text-ink-950">{savedAddress.address}, {savedAddress.commune}</dd>{savedAddress.reference && <span className="mt-1 block text-xs text-slate-500">{savedAddress.reference}</span>}</div></dl><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEditingAddress(true)}><Pencil size={16} /> Editar dirección</button>{confirmDelete ? <><button className="border-critical-600 bg-critical-600 text-white hover:bg-critical-700" type="button" disabled={savingAddress} onClick={deleteAddress}><Trash2 size={16} /> Confirmar eliminación</button><button className="border-slate-300 bg-white text-ink-700" type="button" disabled={savingAddress} onClick={() => setConfirmDelete(false)}>Cancelar</button></> : <button className="border-critical-300 bg-white text-critical-600 hover:bg-critical-50" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Eliminar</button>}</div></div>
        ) : (
          <div className="client-account-surface grid justify-items-start gap-3 rounded-md bg-slate-50 p-5"><MapPin className="text-rust-600" size={28} /><div><strong className="text-sm text-ink-950">No tienes una dirección guardada</strong><p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Agrégala aquí y estará disponible automáticamente en tu próximo checkout.</p></div><button type="button" onClick={() => setEditingAddress(true)}>Agregar dirección</button></div>
        )}
      </AccordionSection>
    </main>
  );
}
