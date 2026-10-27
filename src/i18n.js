// -----------------------------------------------------------------------------
// Runtime texts (English and French): device, feature and mode names, the
// status of the integration, the answers of the button and the command errors.
// -----------------------------------------------------------------------------

import { CIRCUIT_FEATURES as CF, FEATURES as F } from './constants.js';

const both = (en, fr) => ({ en, fr });

/** One language of a `{ en, fr }` text. */
export const word = (value, language) => (language === 'en' ? value.en : value.fr);

/** Two texts one after the other, in both languages. */
export const join = (a, b) => both(`${a.en} ${b.en}`, `${a.fr} ${b.fr}`);

/** "45 s", "5 min", "2 h", in both languages. */
export function age(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 90) return both(`${seconds} s`, `${seconds} s`);
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return both(`${minutes} min`, `${minutes} min`);
  const hours = Math.round(minutes / 60);
  return both(`${hours} h`, `${hours} h`);
}

export const DEVICE_NAME = both('iDM heat pump', 'Pompe à chaleur iDM');

export const FEATURE_NAMES = {
  [F.SYSTEM_MODE]: both('Operating mode', 'Mode de fonctionnement'),
  [F.OPERATING_STATE]: both('Heat pump state', 'État de la pompe à chaleur'),
  [F.FAULT]: both('Fault (heat pump locked)', 'Défaut (pompe à chaleur verrouillée)'),
  [F.COMPRESSOR]: both('Compressor running', 'Compresseur en marche'),
  [F.CHARGE_PUMP]: both('Charge pump running', 'Pompe de charge en marche'),
  [F.TEMP_OUTDOOR]: both('Outdoor temperature', 'Température extérieure'),
  [F.TEMP_OUTDOOR_AVERAGE]: both('Average outdoor temperature', 'Température extérieure moyenne'),
  [F.TEMP_FLOW]: both('Heat pump flow temperature', 'Température de départ de la PAC'),
  [F.TEMP_RETURN]: both('Heat pump return temperature', 'Température de retour de la PAC'),
  [F.TEMP_SOURCE_IN]: both('Heat source inlet temperature', 'Température d’entrée de la source'),
  [F.TEMP_SOURCE_OUT]: both('Heat source outlet temperature', 'Température de sortie de la source'),
  [F.TEMP_AIR_INTAKE]: both('Air intake temperature', 'Température d’aspiration de l’air'),
  [F.TEMP_HEAT_STORAGE]: both('Buffer tank temperature', 'Température du ballon tampon'),
  [F.TEMP_DHW_TOP]: both('Hot water temperature (top)', 'Température de l’eau chaude (haut)'),
  [F.TEMP_DHW_BOTTOM]: both('Hot water temperature (bottom)', 'Température de l’eau chaude (bas)'),
  [F.TEMP_DHW_TAP]: both('Hot water tap temperature', 'Température de l’eau chaude au puisage'),
  [F.DHW_SETPOINT]: both('Hot water setpoint', 'Consigne d’eau chaude'),
  [F.HUMIDITY]: both('Humidity', 'Humidité'),
  [F.POWER]: both('Electrical power of the heat pump', 'Puissance électrique de la PAC'),
  [F.TEMP_SOLAR_COLLECTOR]: both('Solar collector temperature', 'Température du capteur solaire'),
  [F.TEMP_SOLAR_COLLECTOR_RETURN]: both(
    'Solar collector return temperature',
    'Température de retour du capteur solaire',
  ),
  [F.TEMP_SOLAR_CHARGE]: both('Solar charge temperature', 'Température de charge solaire'),
};

export const CIRCUIT_FEATURE_NAMES = {
  [CF.MODE]: both('mode', 'mode'),
  [CF.ACTIVE]: both('current state', 'état en cours'),
  [CF.SETPOINT]: both('room setpoint (normal)', 'consigne ambiante (normal)'),
  [CF.TEMP_FLOW]: both('flow temperature', 'température de départ'),
  [CF.TEMP_FLOW_TARGET]: both('flow target temperature', 'température de départ visée'),
  [CF.TEMP_ROOM]: both('room temperature', 'température ambiante'),
};

/** "Heating circuit A: mode". */
export const circuitFeatureName = (circuit, suffix) =>
  both(
    `Heating circuit ${circuit.toUpperCase()}: ${CIRCUIT_FEATURE_NAMES[suffix].en}`,
    `Circuit de chauffage ${circuit.toUpperCase()} : ${CIRCUIT_FEATURE_NAMES[suffix].fr}`,
  );

/** The system modes (register 1005). */
export const SYSTEM_MODE_NAMES = {
  standby: both('Standby (stopped)', 'Veille (arrêt)'),
  automatic: both('Automatic', 'Automatique'),
  away: both('Away', 'Absent'),
  holiday: both('Holiday (read only)', 'Vacances (lecture seule)'),
  'dhw-only': both('Hot water only', 'Eau chaude seulement'),
  'heating-cooling-only': both('Heating/cooling only', 'Chauffage/rafraîchissement seulement'),
};

/** The modes of a heating circuit (registers 1393-1399). */
export const CIRCUIT_MODE_NAMES = {
  off: both('Off', 'Arrêt'),
  program: both('Time program', 'Programme horaire'),
  normal: both('Normal', 'Normal'),
  eco: both('Eco', 'Éco'),
  'manual-heating': both('Manual heating', 'Chauffage manuel'),
  'manual-cooling': both('Manual cooling', 'Rafraîchissement manuel'),
};

/** The integration status and the answers of the button. */
export const T = {
  noHost: both(
    'Enter the IP address of your iDM heat pump (NAVIGATOR 2.0, Modbus TCP), then save.',
    'Saisissez l’adresse IP de votre pompe à chaleur iDM (NAVIGATOR 2.0, Modbus TCP), puis enregistrez.',
  ),
  invalid: (length) =>
    both(
      `Invalid address (${length} characters): an IPv4 address or a host name, optionally with a port.`,
      `Adresse invalide (${length} caractères) : une adresse IPv4 ou un nom d’hôte, avec un port si besoin.`,
    ),
  badUnitId: both(
    'Invalid Modbus unit id: a whole number from 1 to 247 (1 on a NAVIGATOR). Nothing is read.',
    'Identifiant d’unité Modbus invalide : un nombre entier de 1 à 247 (1 sur un NAVIGATOR). Rien n’est lu.',
  ),
  badCircuits: both(
    'Heating circuits: only the letters A to G are read (for example "A, B"); the rest was ignored.',
    'Circuits de chauffage : seules les lettres A à G sont lues (par exemple « A, B ») ; le reste a été ignoré.',
  ),
  configUnreadable: both(
    'The configuration could not be read from Gladys: tried again every 30 s. A stop (standby, circuit off) still goes to the last heat pump read.',
    'La configuration n’a pas pu être lue depuis Gladys : nouvel essai toutes les 30 s. Un arrêt (veille, circuit à l’arrêt) part quand même vers la dernière pompe à chaleur lue.',
  ),
  connecting: both('Reading the heat pump…', 'Lecture de la pompe à chaleur…'),
  waiting: (wait) =>
    both(
      `Next read of the heat pump in ${wait.en} (never sooner than the refresh interval).`,
      `Prochaine lecture de la pompe à chaleur dans ${wait.fr} (jamais avant l’intervalle de rafraîchissement).`,
    ),
  lastRead: (ago) => both(`Last read ${ago.en} ago.`, `Dernière lecture il y a ${ago.fr}.`),
  connected: (summary) => both(`Connected. ${summary.en}`, `Connecté. ${summary.fr}`),
  unreachable: (address, wait) =>
    both(
      `No answer from ${address} (next try in ${wait.en}). Check the address, that "Modbus TCP" is on in the "Building management" menu of the NAVIGATOR, and the Modbus unit id.`,
      `Pas de réponse de ${address} (nouvel essai dans ${wait.fr}). Vérifiez l’adresse, que « Modbus TCP » est activé dans le menu « Gestion technique du bâtiment » du NAVIGATOR, et l’identifiant d’unité Modbus.`,
    ),
  failing: (reason, wait) =>
    both(
      `The heat pump answered badly (${reason}); next try in ${wait.en}.`,
      `La pompe à chaleur a mal répondu (${reason}) ; nouvel essai dans ${wait.fr}.`,
    ),
  missingBlocks: (names) => both(`Not read this time: ${names}.`, `Non lus cette fois : ${names}.`),
  summary: (values) => {
    const mode = values.systemMode
      ? SYSTEM_MODE_NAMES[values.systemMode]
      : both('unknown mode', 'mode inconnu');
    const fault = values.fault === 1 ? both(', FAULT', ', DÉFAUT') : both('', '');
    return both(
      `iDM: ${mode.en.toLowerCase()}${fault.en}.`,
      `iDM : ${mode.fr.toLowerCase()}${fault.fr}.`,
    );
  },
};

/** The errors a command answers to Gladys. */
export const ERRORS = {
  readOnly: both('This feature is read only.', 'Cette fonctionnalité est en lecture seule.'),
  badValue: both('Unknown value: not sent.', 'Valeur inconnue : non envoyée.'),
  notWritable: both(
    'This mode is shown only, Gladys never sets it: not sent.',
    'Ce mode est seulement affiché, Gladys ne le règle jamais : non envoyé.',
  ),
  badNumber: both('Not a number: not sent.', 'Ce n’est pas un nombre : non envoyé.'),
  badStep: (step) =>
    both(`Steps of ${step} °C only: not sent.`, `Par pas de ${step} °C seulement : non envoyé.`),
  outOfRange: (min, max) =>
    both(
      `Out of range (${min} to ${max} °C): not sent.`,
      `Hors limites (${min} à ${max} °C) : non envoyé.`,
    ),
  dhwCap: (cap) =>
    both(
      `Above the hot water ceiling of the configuration (${cap} °C, 60 °C at most): not sent.`,
      `Au-dessus du plafond d’eau chaude de la configuration (${cap} °C, 60 °C au plus) : non envoyé.`,
    ),
  disabled: both(
    'Commands are disabled: turn on "Allow the commands" in the configuration of the integration.',
    'Les commandes sont désactivées : activez « Autoriser les commandes » dans la configuration de l’intégration.',
  ),
  noHost: both(
    'No valid address or Modbus unit id in the configuration: not sent.',
    'Aucune adresse ou identifiant d’unité Modbus valide dans la configuration : non envoyée.',
  ),
  noCircuit: both(
    'This heating circuit is not in the configuration any more: not sent.',
    'Ce circuit de chauffage n’est plus dans la configuration : non envoyée.',
  ),
  quota: (count) =>
    both(
      `Already ${count} changes of this setting in the last hour: the NAVIGATOR keeps it in a memory with limited write cycles. Not sent; try again later.`,
      `Déjà ${count} changements de ce réglage dans la dernière heure : le NAVIGATOR le garde dans une mémoire à nombre d’écritures limité. Non envoyée ; réessayez plus tard.`,
    ),
  unknownValue: both(
    'The current value could not be read just before: command not sent.',
    'La valeur actuelle n’a pas pu être relue juste avant : commande non envoyée.',
  ),
  stopPending: both(
    'Stop not sent yet, still trying to reach the heat pump: check its state in a few seconds.',
    'Arrêt pas encore envoyé, la pompe à chaleur est encore en cours de connexion : vérifiez son état dans quelques secondes.',
  ),
  configChanged: both(
    'The configuration changed meanwhile: not sent.',
    'La configuration a changé entre-temps : non envoyée.',
  ),
  busy: both(
    'Another command to the heat pump is still running: not sent.',
    'Une autre commande vers la pompe à chaleur est encore en cours : non envoyée.',
  ),
  protectMeanwhile: both(
    'A stop was sent meanwhile: not sent.',
    'Un arrêt a été envoyé entre-temps : non envoyée.',
  ),
  tooSlow: both(
    'The heat pump answered too slowly to send the command in time: not sent.',
    'La pompe à chaleur a répondu trop lentement pour envoyer la commande à temps : non envoyée.',
  ),
  unknownState: (reason) =>
    both(
      `The current value could not be read just before (${reason}): command not sent.`,
      `La valeur actuelle n’a pas pu être relue juste avant (${reason}) : commande non envoyée.`,
    ),
  refused: (reason) =>
    both(
      `The heat pump refused the command (${reason}): not applied.`,
      `La pompe à chaleur a refusé la commande (${reason}) : non appliquée.`,
    ),
  notSent: (reason) =>
    both(
      `The heat pump could not be reached (${reason}): command not sent.`,
      `La pompe à chaleur n’a pas pu être jointe (${reason}) : commande non envoyée.`,
    ),
  sentUnconfirmed: (reason) =>
    both(
      `Command sent, without confirmation (${reason}): the NAVIGATOR applies a change in about 15 s, check the state of the heat pump then.`,
      `Commande envoyée, sans confirmation (${reason}) : le NAVIGATOR applique un changement en 15 s environ, vérifiez alors l’état de la pompe à chaleur.`,
    ),
  queued: both(
    'Command waiting its turn behind other commands (a scene): it is sent within 15 s of the click, or not at all; check the state of the heat pump in a few seconds.',
    'Commande en attente derrière d’autres commandes (une scène) : elle part dans les 15 s qui suivent le clic, ou pas du tout ; vérifiez l’état de la pompe à chaleur dans quelques secondes.',
  ),
  noAnswerYet: both('no answer yet', 'pas encore de réponse'),
  readBackDiffers: both(
    'the value read back is not the one asked',
    'la valeur relue n’est pas celle demandée',
  ),
};
