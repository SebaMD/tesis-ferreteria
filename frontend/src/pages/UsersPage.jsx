import { Clock3, Eye, EyeOff, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import LoadingOverlay from "../components/LoadingOverlay.jsx";
import Pagination from "../components/Pagination.jsx";
import ResponsiveTableView, { MobileDetailField, MobileDetailGrid, MobileRowActions } from "../components/ResponsiveTableView.jsx";
import { compareByNewest, formatDate, formatTableRecordCount } from "../helpers/formatters.js";
import { formatWorkSchedule, getWorkShiftLabel } from "../helpers/labels.js";
import { ROLE_NAMES } from "../helpers/roles.js";
import {
  badgeClass,
  codeCellClass,
  dangerButtonClass,
  emptyTableCellClass,
  formActionsClass,
  pageClass,
  pageHeaderClass,
  secondaryButtonClass,
  tableActionButtonClass,
  tableHeadingClass,
  tablePanelClass,
  tableScrollClass,
} from "../helpers/uiClasses.js";
import usePagination from "../hooks/usePagination.js";
import useAuth from "../hooks/useAuth.js";
import {
  createUserRequest,
  deleteUserRequest,
  getUserRolesRequest,
  getUsersRequest,
  updateCashierScheduleRequest,
  updateUserRequest,
} from "../services/users.service.js";

const ROLE_ORDER = ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE", "CLIENT"];
const USER_DATE_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};
const emptyForm = {
  rut: "",
  names: "",
  surnames: "",
  correo: "",
  password: "",
  phone: "",
  roleName: "CASHIER",
  status: "ACTIVE",
};
const emptyScheduleForm = {
  workShift: "MORNING",
  shiftStartTime: "",
  shiftEndTime: "",
  shiftNote: "",
};
const WORK_SHIFT_OPTIONS = [
  { value: "MORNING", label: "Mañana" },
  { value: "AFTERNOON", label: "Tarde" },
  { value: "OTHER", label: "Otro" },
];
const WORK_SHIFT_TIME_CONFIG = {
  MORNING: { start: "08:00", end: "13:30", defaultStart: "08:00", defaultEnd: "13:30" },
  AFTERNOON: { start: "14:00", end: "20:00", defaultStart: "14:00", defaultEnd: "20:00" },
  OTHER: { start: "08:00", end: "20:00", defaultStart: "08:00", defaultEnd: "20:00" },
};
const NAME_REGEX = /^[\p{L} ]+$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RUT_REGEX = /^\d{7,8}-[\dKk]$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/;
const PHONE_REGEX = /^(?:\+?56)?9\d{8}$/;
const VALID_STATUSES = ["ACTIVE", "INACTIVE"];

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRut(value) {
  return String(value || "").trim().replace(/\./g, "").toUpperCase();
}

function normalizePhone(value) {
  const phone = String(value || "").trim();
  if (!phone) return null;

  const compactPhone = phone.replace(/[\s().-]/g, "");
  if (!PHONE_REGEX.test(compactPhone)) return null;
  if (compactPhone.startsWith("+56")) return compactPhone;
  if (compactPhone.startsWith("56")) return `+${compactPhone}`;
  return `+56${compactPhone}`;
}

function validateUserForm(form, { isEditing, isAdminStatusLocked }) {
  const names = normalizeText(form.names);
  const surnames = normalizeText(form.surnames);
  const rut = normalizeRut(form.rut);
  const correo = normalizeEmail(form.correo);
  const password = String(form.password || "");

  if (!names) return { success: false, message: "El nombre es obligatorio." };
  if (names.length < 3 || names.length > 120 || !NAME_REGEX.test(names)) {
    return { success: false, message: "El nombre debe tener entre 3 y 120 caracteres y solo letras o espacios." };
  }

  if (!surnames) return { success: false, message: "El apellido es obligatorio." };
  if (surnames.length < 3 || surnames.length > 120 || !NAME_REGEX.test(surnames)) {
    return { success: false, message: "El apellido debe tener entre 3 y 120 caracteres y solo letras o espacios." };
  }

  if (!rut) return { success: false, message: "El RUT es obligatorio." };
  if (!RUT_REGEX.test(rut)) {
    return { success: false, message: "El RUT debe ir sin puntos y con guion. Ejemplo: 12345678-9." };
  }

  if (!correo) return { success: false, message: "El correo electrónico es obligatorio." };
  if (correo.length > 255 || !EMAIL_REGEX.test(correo)) {
    return { success: false, message: "El correo electrónico no tiene un formato válido." };
  }

  if (!form.roleName || !ROLE_ORDER.includes(form.roleName)) {
    return { success: false, message: "Debe seleccionar un rol." };
  }

  if (!VALID_STATUSES.includes(form.status)) {
    return { success: false, message: "Debe seleccionar un estado válido." };
  }

  if (isAdminStatusLocked && form.status !== "ACTIVE") {
    return { success: false, message: "No se puede cambiar el estado de un usuario administrador." };
  }

  if (!isEditing && !password) {
    return { success: false, message: "La contraseña es obligatoria." };
  }

  if (password && !PASSWORD_REGEX.test(password)) {
    return {
      success: false,
      message: "La contraseña debe tener 8 a 128 caracteres, una mayúscula, un número y un carácter especial.",
    };
  }

  const phone = normalizePhone(form.phone);
  if (String(form.phone || "").trim() && !phone) {
    return { success: false, message: "El teléfono debe ser un móvil chileno válido. Ejemplo: +56912345678." };
  }

  return {
    success: true,
    value: {
      rut,
      names,
      surnames,
      correo,
      phone,
      roleName: form.roleName,
      status: form.status,
      password,
    },
  };
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildTimeOptions(start, end, step = 30) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (startMinutes === null || endMinutes === null || startMinutes > endMinutes) return [];

  const options = [];
  for (let current = startMinutes; current <= endMinutes; current += step) {
    options.push(minutesToTime(current));
  }

  return options;
}

function getShiftTimeConfig(workShift) {
  return WORK_SHIFT_TIME_CONFIG[workShift] || WORK_SHIFT_TIME_CONFIG.OTHER;
}

function getShiftTimeOptions(workShift) {
  const config = getShiftTimeConfig(workShift);
  return buildTimeOptions(config.start, config.end);
}

function isTimeAllowedForShift(workShift, time) {
  return getShiftTimeOptions(workShift).includes(time);
}

function normalizeScheduleTimes(workShift, startTime, endTime) {
  const config = getShiftTimeConfig(workShift);
  const options = getShiftTimeOptions(workShift);
  const startOptions = options.slice(0, -1);
  const start = startOptions.includes(startTime) ? startTime : config.defaultStart;
  const endOptions = options.filter((time) => timeToMinutes(time) > timeToMinutes(start));
  const end = endOptions.includes(endTime) ? endTime : config.defaultEnd;

  return {
    shiftStartTime: start,
    shiftEndTime: endOptions.includes(end) ? end : endOptions[0] || "",
  };
}

function getRoleOptions(roles) {
  const roleByName = new Map(roles.map((role) => [role.name, role]));

  return ROLE_ORDER
    .map((roleName) => roleByName.get(roleName))
    .filter(Boolean)
    .map((role) => ({ ...role, label: ROLE_NAMES[role.name] || role.name }));
}

export default function UsersPage() {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [activeForm, setActiveForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [scheduleUser, setScheduleUser] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const roleOptions = useMemo(() => getRoleOptions(roles), [roles]);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredUsers = useMemo(
    () => users.filter((user) => {
      if (roleFilter && user.roleName !== roleFilter) return false;
      if (!normalizedSearch) return true;

      const searchableValues = [
        user.id,
        user.rut,
        user.names,
        user.surnames,
        user.correo,
        user.phone,
        user.roleName,
        ROLE_NAMES[user.roleName],
        user.status,
        user.workShift,
        getWorkShiftLabel(user.workShift),
        user.shiftStartTime,
        user.shiftEndTime,
        user.shiftNote,
      ];

      return searchableValues.some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch));
    }).sort(compareByNewest),
    [normalizedSearch, roleFilter, users],
  );
  const usersPagination = usePagination(filteredUsers, {
    resetKey: `${normalizedSearch}|${roleFilter}|${users.length}`,
  });
  const hasUserFilters = Boolean(normalizedSearch || roleFilter);
  const isEditing = Boolean(editingUserId);
  const editingUser = users.find((user) => user.id === editingUserId);
  const isEditingOwnUser = isEditing && Number(editingUser?.id) === Number(authUser?.id);
  const isEditingOwnAdmin = isEditingOwnUser && editingUser?.roleName === "ADMIN";
  const activeAdminCount = users.filter((user) => user.roleName === "ADMIN" && user.status === "ACTIVE").length;
  const shiftTimeOptions = getShiftTimeOptions(scheduleForm.workShift);
  const shiftStartOptions = shiftTimeOptions.slice(0, -1);
  const shiftEndOptions = shiftTimeOptions.filter(
    (time) => timeToMinutes(time) > timeToMinutes(scheduleForm.shiftStartTime),
  );

  const loadUsers = async () => {
    setLoading(true);

    try {
      const [usersData, rolesData] = await Promise.all([
        getUsersRequest(),
        getUserRolesRequest(),
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers().catch((err) => toast.error(getApiError(err, "No se pudieron cargar usuarios")));
  }, []);

  const openCreateForm = () => {
    setForm(emptyForm);
    setEditingUserId(null);
    setScheduleUser(null);
    setShowPassword(false);
    setActiveForm(true);
  };

  const startEditing = (user) => {
    setForm({
      rut: user.rut || "",
      names: user.names || "",
      surnames: user.surnames || "",
      correo: user.correo || "",
      password: "",
      phone: user.phone || "",
      roleName: user.roleName || "CASHIER",
      status: user.status || "ACTIVE",
    });
    setEditingUserId(user.id);
    setScheduleUser(null);
    setShowPassword(false);
    setActiveForm(true);
  };

  const openScheduleForm = (user) => {
    const workShift = user.workShift || "MORNING";
    const scheduleTimes = normalizeScheduleTimes(workShift, user.shiftStartTime || "", user.shiftEndTime || "");

    setScheduleUser(user);
    setScheduleForm({
      workShift,
      ...scheduleTimes,
      shiftNote: user.shiftNote || "",
    });
    setActiveForm(false);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingUserId(null);
    setShowPassword(false);
    setActiveForm(false);
  };

  const closeForm = () => {
    if (submitting) return;
    resetForm();
  };

  const resetScheduleForm = () => {
    setScheduleUser(null);
    setScheduleForm(emptyScheduleForm);
  };

  const closeScheduleForm = () => {
    if (submitting) return;
    resetScheduleForm();
  };

  const openDeleteUserModal = () => {
    if (!editingUser) return;

    if (Number(editingUser.id) === Number(authUser?.id)) {
      toast.error("No puedes eliminar tu propio usuario.");
      return;
    }

    if (editingUser.roleName === "ADMIN" && editingUser.status === "ACTIVE" && activeAdminCount <= 1) {
      toast.error("No se puede eliminar este administrador porque el sistema quedaría sin administradores activos.");
      return;
    }

    setDeleteUserTarget(editingUser);
  };

  const closeDeleteUserModal = () => {
    if (submitting) return;
    setDeleteUserTarget(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formValidation = validateUserForm(form, { isEditing, isAdminStatusLocked: isEditingOwnAdmin });
    if (!formValidation.success) {
      toast.error(formValidation.message);
      return;
    }

    const formValue = formValidation.value;
    const selectedRole = isEditingOwnAdmin
      ? null
      : roleOptions.find((role) => role.name === form.roleName);

    if (!isEditingOwnAdmin && !selectedRole?.id) {
      toast.error("Debe seleccionar un rol.");
      return;
    }

    const payload = {
      rut: formValue.rut,
      names: formValue.names,
      surnames: formValue.surnames,
      correo: formValue.correo,
      phone: formValue.phone,
    };

    if (!isEditingOwnAdmin) {
      payload.roleId = Number(selectedRole.id);
    }

    if (!isEditingOwnAdmin) {
      payload.status = !isEditing && formValue.roleName === "ADMIN" ? "ACTIVE" : formValue.status;
    }

    if (!isEditing || formValue.password) {
      payload.password = formValue.password;
    }

    try {
      setSubmitting(true);
      if (isEditing) {
        await updateUserRequest(editingUserId, payload);
      } else {
        await createUserRequest(payload);
      }
      toast.success(isEditing ? "Usuario actualizado exitosamente" : "Usuario creado exitosamente");
      resetForm();
      await loadUsers();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo guardar el usuario"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleShiftChange = (workShift) => {
    setScheduleForm((current) => ({
      ...current,
      workShift,
      ...normalizeScheduleTimes(workShift, "", ""),
    }));
  };

  const handleScheduleStartTimeChange = (shiftStartTime) => {
    setScheduleForm((current) => {
      const nextEndOptions = getShiftTimeOptions(current.workShift).filter(
        (time) => timeToMinutes(time) > timeToMinutes(shiftStartTime),
      );
      const shiftEndTime = nextEndOptions.includes(current.shiftEndTime)
        ? current.shiftEndTime
        : nextEndOptions[0] || "";

      return {
        ...current,
        shiftStartTime,
        shiftEndTime,
      };
    });
  };

  const handleScheduleSubmit = async (event) => {
    event.preventDefault();

    if (!scheduleUser) return;

    if (
      !isTimeAllowedForShift(scheduleForm.workShift, scheduleForm.shiftStartTime) ||
      !isTimeAllowedForShift(scheduleForm.workShift, scheduleForm.shiftEndTime)
    ) {
      toast.error("Selecciona horas validas para el turno elegido");
      return;
    }

    if (scheduleForm.shiftStartTime >= scheduleForm.shiftEndTime) {
      toast.error("La hora de inicio debe ser menor a la hora de termino");
      return;
    }

    try {
      setSubmitting(true);
      await updateCashierScheduleRequest(scheduleUser.id, {
        workShift: scheduleForm.workShift,
        shiftStartTime: scheduleForm.shiftStartTime,
        shiftEndTime: scheduleForm.shiftEndTime,
        shiftNote: scheduleForm.shiftNote.trim() || null,
      });
      toast.success("Horario de cajero actualizado exitosamente");
      resetScheduleForm();
      await loadUsers();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo actualizar el horario del cajero"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;

    try {
      setSubmitting(true);
      await deleteUserRequest(deleteUserTarget.id);
      toast.success("Usuario eliminado exitosamente");
      setDeleteUserTarget(null);
      setForm(emptyForm);
      setEditingUserId(null);
      setActiveForm(false);
      await loadUsers();
    } catch (err) {
      toast.error(getApiError(err, "No se pudo eliminar el usuario"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={pageClass}>
      <LoadingOverlay active={loading} />

      <div className={pageHeaderClass}>
        <div>
          <h1>Usuarios</h1>
          <p>Administración de usuarios internos y cuentas de clientes.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3.5 max-[720px]:flex-col max-[720px]:items-stretch">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <label className="relative block w-full max-w-110 max-[720px]:max-w-none">
            <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
            <input
              className="pl-9.75"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, correo o RUT"
              aria-label="Buscar usuarios"
            />
          </label>
          <select className="w-full max-w-55 max-[720px]:max-w-none" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrar usuarios por rol">
            <option value="">Todos los roles</option>
            {roleOptions.map((role) => <option key={role.name} value={role.name}>{role.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={openCreateForm}>
          <UserPlus size={18} />
          Nuevo usuario
        </button>
      </div>

      <AppModal
        open={activeForm}
        title={isEditing ? "Editar usuario" : "Nuevo usuario"}
        description="El Administrador puede gestionar usuarios internos y cuentas de clientes."
        onClose={closeForm}
        size="large"
      >
        <form className="grid gap-3.75" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Nombres
              <input value={form.names} onChange={(event) => setForm((current) => ({ ...current, names: event.target.value }))} required />
            </label>
            <label>
              Apellidos
              <input value={form.surnames} onChange={(event) => setForm((current) => ({ ...current, surnames: event.target.value }))} required />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              RUT
              <input
                value={form.rut}
                onChange={(event) => setForm((current) => ({ ...current, rut: event.target.value }))}
                placeholder="12345678-9"
                required
              />
            </label>
            <label>
              Correo
              <input
                type="email"
                value={form.correo}
                onChange={(event) => setForm((current) => ({ ...current, correo: event.target.value }))}
                required
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Contraseña
              <span className="relative block">
                <input
                  className="pr-11"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={isEditing ? "Dejar vacío para mantener" : "Ej: Usuario123."}
                  required={!isEditing}
                />
                <button
                  className="absolute top-1/2 right-1.5 h-8 min-h-0 w-8 -translate-y-1/2 border-0 bg-transparent p-0 text-slate-500 hover:bg-slate-100 hover:text-ink-950"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            <label>
              Teléfono
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="+56 9 1234 5678"
              />
            </label>
          </div>
          {!isEditingOwnAdmin && (
            <div className={`grid gap-3 max-[720px]:grid-cols-1 ${isEditing ? "grid-cols-2" : "grid-cols-1"}`}>
              <label>
                Rol
                <select
                  value={form.roleName}
                  onChange={(event) => {
                    const roleName = event.target.value;
                    setForm((current) => ({
                      ...current,
                      roleName,
                      status: roleName === "ADMIN" ? "ACTIVE" : current.status,
                    }));
                  }}
                >
                  {roleOptions.map((role) => (
                    <option key={role.name} value={role.name}>{role.label}</option>
                  ))}
                </select>
              </label>
              {isEditing && (
                <label>
                  Estado
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                  </select>
                </label>
              )}
            </div>
          )}
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeForm} disabled={submitting}>Cancelar</button>
            {isEditing && !isEditingOwnUser && (
              <button className={dangerButtonClass} type="button" onClick={openDeleteUserModal} disabled={submitting}>
                <Trash2 size={17} />
                Eliminar usuario
              </button>
            )}
            <button type="submit" disabled={submitting}>{isEditing ? "Actualizar usuario" : "Guardar usuario"}</button>
          </div>
        </form>
      </AppModal>

      <AppModal
        open={Boolean(deleteUserTarget)}
        title="Eliminar usuario"
        description="Esta acción eliminará permanentemente al usuario seleccionado y no se puede deshacer."
        onClose={closeDeleteUserModal}
        footer={(
          <>
            <button className={secondaryButtonClass} type="button" onClick={closeDeleteUserModal} disabled={submitting}>
              No, volver
            </button>
            <button className={dangerButtonClass} type="button" onClick={handleDeleteUser} disabled={submitting}>
              Sí, eliminar
            </button>
          </>
        )}
      >
        <div className="grid gap-3 text-sm text-slate-600">
          <p className="m-0 font-semibold text-ink-950">¿Estás seguro de eliminar este usuario?</p>
          {deleteUserTarget && (
            <p className="m-0">
              Usuario: <strong>{deleteUserTarget.names} {deleteUserTarget.surnames}</strong>
            </p>
          )}
        </div>
      </AppModal>

      <AppModal
        open={Boolean(scheduleUser)}
        title={scheduleUser ? `Horario de ${scheduleUser.names} ${scheduleUser.surnames}` : "Horario de cajero"}
        description="Esta configuración aplica solo a usuarios con rol Cajero."
        onClose={closeScheduleForm}
      >
        <form className="grid gap-3.75" onSubmit={handleScheduleSubmit}>
          <label>
            Turno
            <select
              value={scheduleForm.workShift}
              onChange={(event) => handleScheduleShiftChange(event.target.value)}
              required
            >
              {WORK_SHIFT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Hora de inicio
              <select
                value={scheduleForm.shiftStartTime}
                onChange={(event) => handleScheduleStartTimeChange(event.target.value)}
                required
              >
                {shiftStartOptions.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </label>
            <label>
              Hora de término
              <select
                value={scheduleForm.shiftEndTime}
                onChange={(event) => setScheduleForm((current) => ({ ...current, shiftEndTime: event.target.value }))}
                required
              >
                {shiftEndOptions.map((time) => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Observación
            <textarea
              className="min-h-24 resize-y px-4 py-3 leading-[1.45] outline-none focus:border-rust-500 focus:ring-2 focus:ring-rust-100"
              rows="3"
              value={scheduleForm.shiftNote}
              onChange={(event) => setScheduleForm((current) => ({ ...current, shiftNote: event.target.value }))}
              placeholder="Ej: reemplazo, media jornada, horario especial"
            />
          </label>
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeScheduleForm} disabled={submitting}>Cancelar</button>
            <button type="submit" disabled={submitting}>Guardar horario</button>
          </div>
        </form>
      </AppModal>

      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <p className="!m-0">{formatTableRecordCount({
              visibleCount: usersPagination.paginatedItems.length,
              totalCount: users.length,
              filteredCount: filteredUsers.length,
              hasFilters: hasUserFilters,
            })}</p>
          </div>
        </div>
        <ResponsiveTableView
          rows={usersPagination.paginatedItems}
          getRowKey={(user) => user.id}
          getRowLabel={(user) => `${user.names} ${user.surnames}`}
          resetKey={`${usersPagination.page}|${normalizedSearch}|${roleFilter}`}
          emptyMessage={users.length === 0 ? "No hay usuarios registrados." : "No se encontraron usuarios con la búsqueda ingresada."}
          renderSummary={(user) => (
            <div className="grid min-w-0 gap-2">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-ink-950">{user.names} {user.surnames}</strong>
                  <span className="font-mono text-[11px] text-slate-500">#{user.id}</span>
                </div>
                <span className={badgeClass(user.status === "ACTIVE" ? "success" : "neutral")}>
                  {user.status === "ACTIVE" ? "Activo" : "Inactivo"}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-600">{ROLE_NAMES[user.roleName] || user.roleName}</span>
            </div>
          )}
          renderDetails={(user) => (
            <>
              <MobileDetailGrid>
                <MobileDetailField label="RUT">{user.rut}</MobileDetailField>
                <MobileDetailField label="Rol">{ROLE_NAMES[user.roleName] || user.roleName}</MobileDetailField>
                <MobileDetailField label="Correo" wide><span className="break-all">{user.correo}</span></MobileDetailField>
                <MobileDetailField label="Teléfono">{user.phone || "-"}</MobileDetailField>
                <MobileDetailField label="Creado">{formatDate(user.createdAt, USER_DATE_OPTIONS, "-")}</MobileDetailField>
                {user.roleName === "CASHIER" && <MobileDetailField label="Horario" wide>{formatWorkSchedule(user)}</MobileDetailField>}
              </MobileDetailGrid>
              <MobileRowActions>
                <button className={secondaryButtonClass} type="button" onClick={() => startEditing(user)}><Pencil size={17} /> Editar</button>
                {user.roleName === "CASHIER" && (
                  <button className={secondaryButtonClass} type="button" onClick={() => openScheduleForm(user)}>
                    <Clock3 size={16} /> {user.workShift ? "Modificar horario" : "Configurar horario"}
                  </button>
                )}
              </MobileRowActions>
            </>
          )}
          desktop={(
        <div className={tableScrollClass}>
          <table className="min-w-315">
            <thead>
              <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th className="min-w-28 whitespace-nowrap">RUT</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Rol</th>
                <th>Horario</th>
                <th>Estado</th>
                <th>Creado</th>
                <th className="min-w-44 whitespace-nowrap text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usersPagination.paginatedItems.map((user) => (
                <tr key={user.id}>
                  <td className={codeCellClass}>#{user.id}</td>
                  <td>{user.names} {user.surnames}</td>
                  <td className="min-w-28 whitespace-nowrap font-mono text-xs tabular-nums">{user.rut}</td>
                  <td>{user.correo}</td>
                  <td className="whitespace-nowrap">{user.phone || "-"}</td>
                  <td>{ROLE_NAMES[user.roleName] || user.roleName}</td>
                  <td>{user.roleName === "CASHIER" ? formatWorkSchedule(user) : "-"}</td>
                  <td>
                    <span className={badgeClass(user.status === "ACTIVE" ? "success" : "neutral")}>
                      {user.status === "ACTIVE" ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>{formatDate(user.createdAt, USER_DATE_OPTIONS, "-")}</td>
                  <td className="min-w-44 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <button className={`${secondaryButtonClass} ${tableActionButtonClass} mr-0!`} type="button" onClick={() => startEditing(user)}>
                        <Pencil size={17} />
                        Editar
                      </button>
                      {user.roleName === "CASHIER" && (
                        <button className={`${secondaryButtonClass} ${tableActionButtonClass} mr-0!`} type="button" onClick={() => openScheduleForm(user)}>
                          <Clock3 size={16} />
                          {user.workShift ? "Modificar horario" : "Configurar horario"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td className={emptyTableCellClass} colSpan="10">
                    {users.length === 0 ? "No hay usuarios registrados." : "No se encontraron usuarios con la búsqueda ingresada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          )}
        />
        <Pagination
          page={usersPagination.page}
          pageSize={usersPagination.pageSize}
          totalItems={usersPagination.totalItems}
          totalPages={usersPagination.totalPages}
          onPageChange={usersPagination.setPage}
        />
      </div>
    </section>
  );
}
