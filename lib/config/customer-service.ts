/**
 * Fictitious demo customer-service contact (feature spec item 3, "Cerrar
 * cotización"). Copi never books appointments, sells packages, or takes
 * payment (PRD 5.4 "Won't Have") — closing a quote points the patient here
 * instead. Configurable in this one place via optional env vars, with demo
 * defaults so the feature works out of the box. All values are simulated
 * (PRD 7.10: "Todo es simulado").
 */

export interface CustomerServiceContact {
  phone: string;
  whatsapp: string;
  email: string;
  hours: string;
}

const DEMO_DEFAULTS: CustomerServiceContact = {
  phone: "+507 800-COPI (800-2674)",
  whatsapp: "+507 6000-1234",
  email: "servicioalcliente@copi-demo.example",
  hours: "Lunes a viernes, 8:00 a.m. a 6:00 p.m. (hora de Panamá)",
};

/** Reads `CUSTOMER_SERVICE_*` env vars, falling back to fictitious demo defaults. */
export function getCustomerServiceContact(): CustomerServiceContact {
  return {
    phone: process.env.CUSTOMER_SERVICE_PHONE?.trim() || DEMO_DEFAULTS.phone,
    whatsapp: process.env.CUSTOMER_SERVICE_WHATSAPP?.trim() || DEMO_DEFAULTS.whatsapp,
    email: process.env.CUSTOMER_SERVICE_EMAIL?.trim() || DEMO_DEFAULTS.email,
    hours: process.env.CUSTOMER_SERVICE_HOURS?.trim() || DEMO_DEFAULTS.hours,
  };
}
