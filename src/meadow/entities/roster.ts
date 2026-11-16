import { crowd } from '../../engine/animal/animal';
import RIG from '../../../assets/rig.json';
import { cats, dogs, ents } from './registry';
import { PERSONA } from './behaviours';
import { Dog } from './dog';

dogs.push(
  new Dog(0, RIG.brother, { x: 6, z: 14, h: 0.5, name: 'Murphy', persona: PERSONA.murphy }),
  new Dog(1, RIG.sister, { x: -10, z: 22, h: 2.2, name: 'Mali', persona: PERSONA.mali }),
  new Dog(2, RIG.bobby, { x: -50, z: 32, h: 3.1, name: 'Bobby', persona: PERSONA.bobby }),
);
cats.push(
  new Dog(3, RIG.cat1, { x: -26, z: 4, h: 1.0, name: 'Billy', persona: PERSONA.cat1 }),
  new Dog(4, RIG.cat2, { x: 14, z: -34, h: 4.0, name: 'Ashy', persona: PERSONA.cat2 }),
);
cats[0].other = cats[1]; cats[1].other = cats[0];
cats[0].setQueue(cats[0].B('sit'), 'sit'); cats[1].setQueue(cats[1].B('sunbathe'), 'sunbathe');
ents.push(...dogs, ...cats);
crowd.push(...dogs);   // everyone steers round the dogs while walking
dogs[0].other = dogs[1]; dogs[1].other = dogs[0]; dogs[2].other = dogs[1];
dogs[0].setQueue(dogs[0].B('wander'), 'wander');
dogs[1].setQueue(dogs[1].B('sniff'), 'sniff');
dogs[2].setQueue(dogs[2].B('sit'), 'sit');
