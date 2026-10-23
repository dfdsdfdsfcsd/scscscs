export interface Settings {
  id: string;
  created_at?: string;
  updated_at?: string;
  studio_name: string;
  fantasy_name: string | null;
  tax_id: string | null;
  address: string | null;
  cep: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  theme: string;
  date_format: string;
  currency: string;
  business_hours: string | null;
  default_duration_min: number;
  alerts_enabled: boolean;
  alert_advance_days: number;
  documents_folder: string | null;
  exports_folder: string | null;
  backup_folder: string | null;
  cancellation_rules: string | null;
  reschedule_rules: string | null;
  cash_security_enabled: boolean;
  cash_password_hash: string | null;
  cash_password_salt: string | null;
  gdrive_connected: boolean;
  gdrive_account_email: string | null;
  gdrive_auto_sync: boolean;
  gdrive_last_sync: string | null;
  gdrive_root_folder_id: string | null;
  gdrive_root_folder_url: string | null;
}

export interface DocumentSyncLog {
  id: string;
  client_id: string | null;
  attachment_id: string | null;
  file_name: string;
  category: string;
  client_name: string | null;
  year: number;
  status: string;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  drive_url: string | null;
  error_message: string | null;
  synced_at: string | null;
  created_at: string;
}

export interface CashAuditLog {
  id: string;
  operation: string;
  cash_register_id: string | null;
  responsible: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  price: number;
  cost: number;
  duration_min: number;
  unit: string;
  active: boolean;
  observations: string | null;
  payment_conditions: string | null;
  delivery_days: number | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  code: string;
  full_name: string;
  social_name: string | null;
  cpf: string | null;
  cnpj: string | null;
  person_type: string;
  legal_name: string | null;
  fantasy_name: string | null;
  state_registration: string | null;
  municipal_registration: string | null;
  contact_person_name: string | null;
  birth_date: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  cep: string | null;
  address: string | null;
  address_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  first_contact: string | null;
  origin: string | null;
  observations: string | null;
  status: string;
  due_date: string | null;
  baby_name: string | null;
  shoot_type: string | null;
  scenery_preferences: string | null;
  costume_preferences: string | null;
  references_notes: string | null;
  companion_name: string | null;
  pose_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientAttachment {
  id: string;
  client_id: string;
  name: string;
  file_path: string;
  file_type: string | null;
  mode: string;
  observations: string | null;
  attached_at: string;
}

export interface ClientPhotoFolder {
  id: string;
  client_id: string;
  folder_path: string;
  authorization_status: string;
  authorization_notes: string | null;
  last_checked: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientHistory {
  id: string;
  client_id: string;
  event_type: string;
  description: string;
  source_table: string | null;
  source_id: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  code: string;
  client_id: string;
  status: string;
  subtotal: number;
  general_discount: number;
  total: number;
  deposit: number;
  balance: number;
  payment_conditions: string | null;
  valid_until: string | null;
  observations: string | null;
  template_style: string;
  campaign_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetItem {
  id: string;
  budget_id: string;
  service_id: string | null;
  is_custom: boolean;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
}

export interface Appointment {
  id: string;
  client_id: string | null;
  service_id: string | null;
  title: string;
  appointment_date: string;
  start_time: string;
  duration_min: number;
  end_time: string | null;
  location: string | null;
  observations: string | null;
  reminder: boolean;
  status: string;
  appointment_type: string;
  professional: string | null;
  room: string | null;
  equipment: string | null;
  prep_time_min: number;
  is_blocked: boolean;
  block_reason: string | null;
  room_id: string | null;
  equipment_id: string | null;
  professional_id: string | null;
}

export interface CashRegister {
  id: string;
  open_date: string;
  open_time: string;
  close_time: string | null;
  opening_balance: number;
  counted_balance: number | null;
  difference: number | null;
  difference_notes: string | null;
  responsible: string | null;
  notes: string | null;
  status: string;
  total_in: number;
  total_out: number;
}

export interface CashTransaction {
  id: string;
  cash_register_id: string;
  client_id: string | null;
  service_id: string | null;
  budget_id: string | null;
  type: string;
  category: string | null;
  description: string;
  amount: number;
  payment_method: string;
  document_number: string | null;
  responsible: string | null;
  observations: string | null;
  financial_entry_id: string | null;
  created_at: string;
}

export interface FinancialEntry {
  id: string;
  client_id: string | null;
  budget_id: string | null;
  description: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  paid_date: string | null;
  installment_number: number;
  total_installments: number;
  payment_method: string | null;
  category: string;
  status: string;
  discount_amount: number;
  discount_reason: string | null;
  refund_amount: number;
  original_entry_id: string | null;
}

export interface FinancialExpense {
  id: string;
  description: string;
  amount: number;
  paid_amount: number;
  due_date: string;
  paid_date: string | null;
  category: string;
  supplier: string | null;
  payment_method: string | null;
  status: string;
  card_name: string | null;
  total_installments: number;
  installment_number: number;
  parent_expense_id: string | null;
  campaign_id: string | null;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: string;
  title: string;
  body: string;
  header: string | null;
  footer: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  description: string;
  created_at: string;
}

export interface AlertDismissal {
  id: string;
  alert_key: string;
  alert_type: string;
  dismissed_at: string;
}

export interface ImageAuthorization {
  id: string;
  client_id: string;
  photo_folder_id: string | null;
  version: number;
  status: string;
  doc_number: string | null;
  session_date: string | null;
  session_title: string | null;

  authorizer_name: string | null;
  authorizer_cpf: string | null;
  authorizer_relationship: string | null;
  authorizer_email: string | null;
  authorizer_phone: string | null;
  authorizer_address: string | null;

  photographed_name: string | null;
  photographed_cpf: string | null;
  photographed_birth_date: string | null;
  is_minor: boolean;

  minor_legal_guardian_name: string | null;
  minor_legal_guardian_cpf: string | null;
  minor_guardian_relationship: string | null;
  minor_guardian_declaration: string | null;

  purposes: Record<string, boolean>;
  other_purposes_text: string | null;

  materials: Record<string, boolean>;
  other_materials_text: string | null;
  gallery_ref: string | null;

  compensation_type: string;
  compensation_value: number;
  compensation_payment_method: string | null;
  compensation_deadline: string | null;

  editing_permissions: Record<string, boolean>;

  start_date: string | null;
  end_date: string | null;
  renewable: boolean;
  territory: string | null;
  channels: string | null;
  paid_campaign_conditions: string | null;

  data_controller_name: string | null;
  data_processing_purposes: string | null;
  data_categories: string | null;
  legal_basis: string | null;
  data_subject_rights_channel: string | null;
  retention_criteria: string | null;
  security_measures: string | null;
  sharing_conditions: string | null;

  signing_city: string | null;
  signing_date: string | null;
  authorizer_signature: string | null;
  guardian_signature: string | null;
  studio_representative: string | null;
  witness_1_name: string | null;
  witness_1_cpf: string | null;
  witness_2_name: string | null;
  witness_2_cpf: string | null;
  studio_contact_email: string | null;
  studio_contact_phone: string | null;

  awareness_declaration: boolean;
  document_version: string | null;

  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  observations: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImageAuthorizationHistory {
  id: string;
  authorization_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

export interface ServiceOrder {
  id: string;
  code: string;
  client_id: string;
  budget_id: string | null;
  appointment_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  items_summary: string | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  delivered_at: string | null;
  delivery_method: string | null;
  tracking_code: string | null;
  notes: string | null;
  campaign: string | null;
  campaign_id: string | null;
  digital_delivered: boolean;
  digital_delivered_at: string | null;
  printed_delivered: boolean;
  printed_delivered_at: string | null;
  delivery_confirmed: boolean;
  delivery_confirmed_at: string | null;
  delivery_confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  service_id: string | null;
  is_custom: boolean;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
}

export interface ProductionStep {
  id: string;
  order_id: string;
  step_name: string;
  step_order: number;
  status: string;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionStepHistory {
  id: string;
  step_id: string;
  field_changed: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  service_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  label: string;
  item_order: number;
}

export interface Campaign {
  id: string;
  name: string;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  description: string | null;
  goal_revenue: number | null;
  goal_orders: number | null;
  created_at: string;
  updated_at: string;
}

export interface OrderChecklist {
  id: string;
  order_id: string;
  template_id: string | null;
  label: string;
  item_order: number;
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  snapshot_template_name: string | null;
  created_at: string;
}

export interface WaitlistEntry {
  id: string;
  client_id: string;
  service_id: string | null;
  desired_period_start: string;
  desired_period_end: string | null;
  time_preference: string;
  priority: string;
  observations: string | null;
  status: string;
  attended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmTask {
  id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  type: string;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Professional {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  hire_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionRule {
  id: string;
  name: string;
  service_id: string | null;
  professional_id: string | null;
  professional: string | null;
  partner: string | null;
  rule_type: string;
  value: number;
  base: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Commission {
  id: string;
  commission_rule_id: string | null;
  service_order_id: string | null;
  budget_id: string | null;
  service_id: string | null;
  professional_id: string | null;
  professional: string | null;
  partner: string | null;
  description: string;
  base_value: number;
  rule_type_snapshot: string;
  value_snapshot: number;
  base_snapshot: string;
  estimated_amount: number;
  due_amount: number;
  status: string;
  paid_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: string | null;
  serial_number: string | null;
  condition: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentLoan {
  id: string;
  equipment_id: string;
  responsible: string;
  checkout_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EquipmentMaintenance {
  id: string;
  equipment_id: string;
  description: string;
  start_date: string;
  end_date: string | null;
  cost: number;
  provider: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  min_stock: number;
  current_stock: number;
  unit_cost: number;
  supplier_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  movement_type: 'entrada' | 'saida' | 'perda' | 'devolucao' | 'ajuste';
  quantity: number;
  reason: string | null;
  movement_date: string;
  unit_cost: number | null;
  financial_expense_id: string | null;
  service_order_id: string | null;
  supplier_id: string | null;
  user_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface OrderMaterialConsumption {
  id: string;
  service_order_id: string;
  inventory_item_id: string;
  movement_id: string;
  quantity: number;
  unit_cost: number;
  consumed_at: string;
}

export interface SalesFunnel {
  id: string;
  client_id: string | null;
  stage: string;
  origin: string | null;
  intended_service: string | null;
  campaign_id: string | null;
  responsible: string | null;
  next_action: string | null;
  next_action_date: string | null;
  loss_reason: string | null;
  budget_id: string | null;
  order_id: string | null;
  estimated_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostSaleFeedback {
  id: string;
  service_order_id: string;
  client_id: string;
  satisfaction_score: number;
  observations: string | null;
  reported_problems: string | null;
  needs_followup: boolean;
  followup_done: boolean;
  feedback_date: string;
  created_at: string;
  updated_at: string;
}

export interface MonthlyClosing {
  id: string;
  period_month: number;
  period_year: number;
  total_receivable: number;
  total_received: number;
  total_payable: number;
  total_paid: number;
  cash_in: number;
  cash_out: number;
  discrepancies: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
