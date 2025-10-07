// skill.js
// Defines skill objects and helper functions for applying skills.

/**
 * Skill manifest defines available skills, cost in gold, and metadata.
 * Each skill has an `id`, `name`, `cost`, `description`, and `apply` function
 * which executes the skill effect given the current user and required params.
 */
export const SKILLS = {
  steal_random_lv1: {
    id: 'steal_random_lv1',
    name: 'Rob (Lv 1)',
    cost: 50,
    description: 'Steal a small amount of points from a random active user.',
  // using the global skill image
  image: './imgs/skill.png',
    // apply should be async and return a result object { success, amount, fromUserId }
    apply: async ({ db, currentUser }) => {
      // implementation is handled in shop module where db access exists; placeholder
      throw new Error('Not implemented: use shop.applySkill to run skills with db access');
    }
  },
  steal_target_lv2: {
    id: 'steal_target_lv2',
    name: 'Rob (Lv 2)',
    cost: 150,
    description: 'Steal a larger amount of points from a chosen user.',
  // using the global skill image
  image: './imgs/skill.png',
    apply: async ({ db, currentUser, targetUserId }) => {
      throw new Error('Not implemented: use shop.applySkill to run skills with db access');
    }
  }
};

export default SKILLS;
