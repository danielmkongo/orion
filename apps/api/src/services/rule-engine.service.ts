import { Rule } from '../models/Rule.js';
import { Alert } from '../models/Alert.js';
import { Organization } from '../models/Organization.js';
import { emailService } from './email.service.js';
import { smsService } from './sms.service.js';
import { webhookService } from './webhook.service.js';
import { mqttService } from './mqtt.service.js';
import { commandService } from './command.service.js';

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => vars[key] ?? '');
}

function evalCondition(field: string, operator: string, ruleValue: unknown, fieldValue: unknown): boolean {
  const fv = typeof fieldValue === 'number' ? fieldValue : parseFloat(String(fieldValue));
  const rv = typeof ruleValue === 'number' ? ruleValue : parseFloat(String(ruleValue));

  switch (operator) {
    case 'gt':  return !isNaN(fv) && !isNaN(rv) && fv > rv;
    case 'gte': return !isNaN(fv) && !isNaN(rv) && fv >= rv;
    case 'lt':  return !isNaN(fv) && !isNaN(rv) && fv < rv;
    case 'lte': return !isNaN(fv) && !isNaN(rv) && fv <= rv;
    case 'eq':  return String(fieldValue) === String(ruleValue);
    case 'neq': return String(fieldValue) !== String(ruleValue);
    case 'contains': return String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());
    default:    return false;
  }
}

export class RuleEngineService {
  async evaluate(
    orgId: string,
    deviceId: string,
    fields: Record<string, unknown>,
    device: { name?: string; serialNumber?: string } & Record<string, unknown>
  ): Promise<void> {
    const rules = await Rule.find({
      orgId,
      isEnabled: true,
      $or: [
        { deviceIds: { $size: 0 } },
        { deviceIds: deviceId },
      ],
    }).lean();

    if (!rules.length) return;

    const org = await Organization.findById(orgId).select('name').lean() as any;
    const now = Date.now();

    for (const rule of rules) {
      // Cooldown check
      if (rule.lastFiredAt) {
        const elapsed = (now - new Date(rule.lastFiredAt).getTime()) / 1000;
        if (elapsed < rule.cooldownSeconds) continue;
      }

      // Evaluate conditions
      const results = rule.conditions.map(c => {
        const fieldValue = (fields as any)[c.field];
        if (fieldValue === undefined) return false;
        return evalCondition(c.field, c.operator, c.value, fieldValue);
      });

      const triggered = rule.conditionLogic === 'or'
        ? results.some(Boolean)
        : results.every(Boolean);

      if (!triggered) continue;

      // Build template vars from first matching field
      const firstCond = rule.conditions[0];
      const fieldKey = firstCond?.field ?? '';
      const fieldVal = fieldKey ? String((fields as any)[fieldKey] ?? '') : '';

      const vars: Record<string, string> = {
        'device.name':   device.name ?? '',
        'device.id':     deviceId,
        field:           fieldKey,
        value:           fieldVal,
        timestamp:       new Date().toISOString(),
        'org.name':      org?.name ?? '',
      };

      // Fire all actions
      await Rule.updateOne({ _id: rule._id }, { $inc: { fireCount: 1 }, $set: { lastFiredAt: new Date() } });

      for (const action of rule.actions) {
        try {
          await this.fireAction(action.type, action.config as Record<string, unknown>, vars, rule, orgId, deviceId, fields);
        } catch (err: any) {
          console.error(`[rule-engine] action "${action.type}" failed for rule ${rule._id}: ${err.message}`);
        }
      }
    }
  }

  private async fireAction(
    type: string,
    config: Record<string, unknown>,
    vars: Record<string, string>,
    rule: any,
    orgId: string,
    deviceId: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    switch (type) {
      case 'email':
        await emailService.send(
          {
            to:      interpolate(String(config.to ?? ''), vars),
            subject: interpolate(String(config.subject ?? rule.name), vars),
            body:    interpolate(String(config.body ?? ''), vars),
          },
          vars
        );
        break;

      case 'sms':
        await smsService.send(
          interpolate(String(config.phone ?? config.to ?? ''), vars),
          interpolate(String(config.message ?? config.body ?? ''), vars),
          vars
        );
        break;

      case 'webhook':
        await webhookService.dispatch(
          {
            url:     String(config.url ?? ''),
            method:  String(config.method ?? 'POST'),
            headers: (config.headers as Record<string, string>) ?? {},
            body:    String(config.body ?? JSON.stringify({ rule: rule.name, ...vars })),
          },
          vars
        );
        break;

      case 'mqtt_publish':
        mqttService.publish(
          interpolate(String(config.topic ?? ''), vars),
          interpolate(String(config.payload ?? JSON.stringify(vars)), vars)
        );
        break;

      case 'alert':
        await Alert.create({
          orgId,
          deviceId,
          ruleId: rule._id,
          severity: config.severity ?? rule.priority ?? 'warning',
          title:   interpolate(String(config.title ?? rule.name), vars),
          message: interpolate(String(config.message ?? ''), vars),
          context: { fields, rule: rule.name },
        });
        break;

      case 'command':
        await commandService.create(orgId, 'rule-engine', {
          deviceId,
          name:    interpolate(String(config.name ?? ''), vars),
          payload: config.payload as Record<string, unknown> ?? {},
        });
        break;
    }
  }
}

export const ruleEngineService = new RuleEngineService();
