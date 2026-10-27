# Pompe à chaleur iDM (NAVIGATOR 2.0)

Cette intégration affiche votre pompe à chaleur iDM à régulation **NAVIGATOR 2.0** dans Gladys, par
son interface **Modbus TCP** sur votre réseau local, sans cloud. Elle peut aussi, si vous l’autorisez,
changer les modes et les consignes.

> **Jamais testé avec un vrai appareil.** L’intégration suit la documentation Modbus TCP d’iDM et
> l’intégration Home Assistant `hacs-idm-heatpump`, et a été testée contre une pompe à chaleur simulée
> seulement. Sans lien avec iDM Energiesysteme GmbH.

## Ce qu’il faut

- Une pompe à chaleur iDM à régulation **NAVIGATOR 2.0** (les NAVIGATOR 1.0 et 1.7 ont une autre
  table Modbus : ils ne sont pas pris en charge).
- Le **Modbus TCP activé** : menu « Paramètres » → « Gestion technique du bâtiment » → « Modbus TCP »
  sur « Marche ». Ce réglage est au niveau installateur : demandez-le à votre installateur ou au SAV
  iDM. L’interface web de la pompe à chaleur seule ne suffit pas.
- Une adresse IP fixe pour la pompe à chaleur (réservez-la dans votre box ou réglez-la dans le menu
  réseau du NAVIGATOR).
- Le Modbus TCP n’a **pas de mot de passe** : n’importe quel appareil de votre réseau peut lire et
  écrire les réglages de la pompe à chaleur. Gardez-la sur un **réseau de confiance**, jamais exposée
  à Internet.

## Configuration

| Champ                            | Rôle                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| Adresse IP de la pompe à chaleur | IPv4 ou nom d’hôte, port 502 sauf si vous en ajoutez un (`192.168.1.60:502`).                     |
| Identifiant d’unité Modbus       | 1 sur un NAVIGATOR.                                                                               |
| Circuits de chauffage            | Les lettres de vos circuits, de A à G, séparées par des virgules (`A` par défaut).                |
| Autoriser les commandes          | Désactivé par défaut (voir plus bas).                                                             |
| Plafond d’eau chaude (°C)        | La consigne d’eau chaude la plus haute que Gladys peut envoyer : 55 °C par défaut, 60 °C au plus. |
| Intervalle de rafraîchissement   | 60 s par défaut, de 30 s à 1 h.                                                                   |
| Langue                           | Langue des noms de l’appareil, du statut et des messages.                                         |

Enregistrez, puis ajoutez la pompe à chaleur depuis l’onglet **Découverte**. Le bouton « Tester la
connexion » relit la pompe à chaleur, jamais plus souvent que l’intervalle.

## Ce que vous voyez

- Mode de fonctionnement (veille, automatique, absent, vacances, eau chaude seulement,
  chauffage/rafraîchissement seulement) et état de la pompe à chaleur (veille, chauffage,
  rafraîchissement, eau chaude, dégivrage).
- Défaut (pompe à chaleur verrouillée), compresseur en marche, pompe de charge en marche.
- Températures : extérieure et extérieure moyenne, départ et retour de la pompe à chaleur, entrée et
  sortie de la source, aspiration de l’air, ballon tampon, eau chaude (haut, bas, puisage), consigne
  d’eau chaude.
- Pour chaque circuit configuré : mode, état en cours (arrêt, chauffage, rafraîchissement), consigne
  ambiante « normal », températures ambiante, de départ et de départ visée.
- Si la pompe à chaleur les donne : humidité, puissance électrique (kW), températures solaires
  (capteur, retour du capteur, charge).

Une fonctionnalité n’apparaît qu’une fois qu’une valeur en a été lue. Les valeurs spéciales du
NAVIGATOR ne sont jamais publiées comme des mesures : -1,0 sur une température (capteur absent, sauf
la température extérieure et le départ/retour de la pompe à chaleur, toujours présents), « non
disponible » sur un mode, -1 sur la pompe de charge (publié comme « arrêtée »), une valeur hors plage.
L’énergie thermique (kWh) n’est pas publiée.

## Les commandes

Désactivées par défaut. Avec « Autoriser les commandes », Gladys peut changer :

- le mode de fonctionnement (automatique, absent, eau chaude seulement, chauffage/rafraîchissement
  seulement ; « vacances » est seulement affiché) ;
- le mode d’un circuit configuré (programme horaire, normal, éco, chauffage manuel, rafraîchissement
  manuel) ;
- la consigne ambiante « normal » d’un circuit, de 15 à 30 °C par pas de 0,5 °C ;
- la consigne d’eau chaude, en degrés entiers, de 35 °C au plafond de la configuration (55 °C par
  défaut). **Rien au-dessus de 60 °C n’est jamais envoyé**, quoi qu’il soit saisi.

Chaque commande relit d’abord la valeur actuelle sur la pompe à chaleur, n’écrit rien si elle est
déjà la bonne, puis relit la valeur écrite : elle n’est réussie que si la relecture montre la valeur
demandée. Sinon Gladys répond « envoyée, sans confirmation » et relit la pompe à chaleur 5 s, 25 s et
60 s après (le NAVIGATOR applique un changement en 15 s environ).

Une commande est refusée, sans rien envoyer, quand : l’option est désactivée (vérifiée aussi juste
avant l’écriture), la valeur est hors limites ou au-dessus du plafond, le circuit n’est pas dans la
configuration, la valeur actuelle n’a pas pu être relue, la configuration a changé entre-temps, un
arrêt a été envoyé après son arrivée, 16 commandes attendent déjà, ou ce réglage a déjà été changé 6
fois dans la dernière heure. Cette dernière limite protège la mémoire du NAVIGATOR, qui garde ces
réglages dans une mémoire à nombre d’écritures limité (300 000 selon iDM) ; elle ne s’applique jamais à
une baisse de consigne ni à un arrêt.

Les commandes passent une par une, dans leur ordre d’arrivée, sur une seule connexion. Une scène qui
règle plusieurs valeurs les règle toutes : une commande qui attend son tour au-delà de 4 s reçoit la
réponse « en attente » et part dans les 15 s qui suivent le clic, ou pas du tout.

## Les arrêts

Mettre le mode de fonctionnement sur **Veille** ou un circuit sur **Arrêt** ne dépend **jamais** de
l’option des commandes, ni des limites, ni d’une lecture en cours ou en échec, ni d’une pompe à chaleur
pas encore lue, ni d’une commande en attente. Un arrêt passe devant tout ; toutes les commandes
arrivées avant lui et pas encore parties sont abandonnées. Une connexion refusée est réessayée toutes
les 250 ms pendant 3,5 s.

Un arrêt non confirmé est gardé dans `/data` pendant 3 minutes : les lectures suivantes le renvoient
(3 fois au plus, 20 s au moins après l’envoi) tant que la pompe à chaleur montre encore la valeur
d’avant, et un redémarrage de l’intégration le renvoie aussitôt, avant même de lire la configuration.

Un arrêt peut échouer ou ne pas être renvoyé dans ces cas :

- aucune adresse valide dans la configuration (ou, avant que la configuration soit lue, aucune pompe à
  chaleur lue auparavant) : refusé, rien n’est envoyé ;
- la pompe à chaleur reste injoignable pendant 3,5 s : « non envoyé », puis renvoyé par les lectures
  suivantes et au redémarrage tant que la garde de 3 minutes court ;
- la pompe à chaleur répond une exception Modbus : « refusée » ou « envoyée, sans confirmation » selon
  le code ;
- la relecture ne montre pas encore l’arrêt : « envoyée, sans confirmation » ;
- il n’est plus renvoyé quand quelqu’un a mis une autre valeur sur la pompe à chaleur entre-temps, quand
  une commande plus récente de Gladys pour le même réglage est partie, après 3 renvois ou après
  3 minutes.

Gladys ne remet jamais la pompe à chaleur en marche toute seule.

## Limites connues

- Pas de numéro de série en Modbus : l’appareil est lié à l’intégration, pas à l’adresse IP (changer
  d’adresse garde l’appareil et son historique), et un autre appareil Modbus à la même adresse ne
  serait pas détecté.
- L’écriture du surplus photovoltaïque, les zones de régulation pièce par pièce, la cascade, les
  booster et l’énergie thermique ne sont pas encore pris en charge.
