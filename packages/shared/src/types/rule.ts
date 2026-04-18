export type RuleConditionOperator =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  | 'contains' | 'not_contains'
  | 'is_null' | 'is_not_null'
  | 'regex';

export type RuleActionType =
  | 'alert'
  | 'notification'
  | 'email'
  | 'webhook'
  | 'command'
  | 'set_status'
  | 'create_event'
  | 'suppress';

export type RuleTriggerType = 'telemetry' | 'device_status' | 'location' | 'schedule' | 'command';

export interface RuleCondition {
  field: string;
  operator: RuleConditionOperator;
  value: string | number | boolean | null;
  duration?: number;
}

export interface RuleAction {
  type: RuleActionType;
  config: Record<string, unknown>;
}

export interface Rule {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  triggerType: RuleTriggerType;
  deviceIds?: string[];
  tags?: string[];
  conditions: RuleCondition[];
  conditionLogic: 'and' | 'or';
  actions: RuleAction[];
  isEnabled: boolean;
  cooldownSeconds?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastFiredAt?: string;
  fireCount: number;
}
