// What carries from race to race: score, charges, the machine, letters, upgrades, Dynamo's heat and retries. Pure.
import { HEAT, WEAPONS, WORD, type Upgrade } from './config';

export interface Career {
  score: number;
  charges: number;
  /** Machine index into MACHINES. */
  mk: number;
  letters: boolean[];
  up: Record<Upgrade, number>;
  heat: number;
  retries: number;
}

export const STARTING_RETRIES = 2;

export function newCareer(): Career {
  return {
    score: 0, charges: WEAPONS.startCharges, mk: 0, letters: Array<boolean>(WORD.length).fill(false),
    up: { thruster: 0, core: 0, grip: 0 }, heat: 0, retries: STARTING_RETRIES,
  };
}

/** Dynamo cools off by one between races. */
export const heatForNextRace = (heat: number) => Math.max(0, heat - HEAT.perRace);
