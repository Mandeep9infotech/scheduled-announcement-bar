export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    barLimit: 1,
    allowHtml: false,
    allowPageTargeting: false,
  },
  starter: {
    name: "Starter",
    price: 4.99,
    barLimit: 5,
    allowHtml: false,
    allowPageTargeting: false,
  },
  pro: {
    name: "Pro",
    price: 9.99,
    barLimit: Infinity,
    allowHtml: true,
    allowPageTargeting: true,
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export function getPlanLimits(plan: PlanKey) {
  return PLANS[plan];
}
