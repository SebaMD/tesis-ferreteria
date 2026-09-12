export const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$/;
export const PASSWORD_REQUIREMENTS = "La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial";

export function isValidPassword(password) {
  return PASSWORD_REGEX.test(password);
}
