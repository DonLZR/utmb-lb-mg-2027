# UTMB – Journal des versions

## V2.1.0 — Coach épuré, carte aérienne, badges séquentiels, lexique de traduction 
- Coach : accessoires emoji et animations associées retirés ; bulles conservées avec leurs emojis 
- Coach : « M&L » remplacé par « Marie et Lorenzo » dans les trois langues
- Carte 3D : clic sur une étape moins rapproché et plus aérien ; nouveau réglage Sheet `carte_zoom_etape` (10,8 par défaut)
- Badge « Nouveau » : une seule étape à la fois ; l'ancienne perd son badge dès qu'une nouvelle devient disponible
- Si l'étape suivante reste bloquée, le badge de l'étape courante disparaît dès que son formulaire est envoyé
- Traduction : nouvel onglet `Corrections_traduction` pour remplacer globalement un mot ou une expression en IT/ES, sans modifier le code
- Déploiement : `Code.gs` modifié → coller + enregistrer + **Nouveau déploiement / nouvelle version**, puis `🏔️ UTMB › Mettre à jour la structure`

## V2.0.0 — Coach la marmotte
- Coach (assets/coach/) : 7 animations — coucou, jumelles, montre, ravito (aléatoires) ; dossard, déblocage, matos (événements)
- 0 fichier Coach au démarrage : module + image (~85 Ko) chargés à la 1re apparition (25–50 s, navigateur au repos)
  ou après une action de l'invité ; animations transform/opacity uniquement
- Coach se perche sur un titre visible (le titre se décale légèrement), passe par-dessus le texte, suit le défilement
- Fuite immédiate si l'invité touche / remplit un formulaire (silence 90 s) ; jamais pendant le code d'accès,
  la visionneuse, la modale iPhone, un onglet en arrière-plan ou avec « Réduire les animations »
- Max 3 apparitions aléatoires par visite ; pancartes FR / IT / ES ; bouton ✕ et bouton pied de page « Masquer / Faire revenir Coach »
- Contrôle qualité : ajouter ?coach=demo à l'adresse → les 7 animations à la suite
- Réglages Sheet (Parametres) : coach_active, coach_mobile, coach_evenements, coach_delai_min/max,
  coach_intervalle_min/max, coach_max_visite, coach_taille_pc, coach_taille_mobile
- Code.gs : nouvelles lignes Parametres uniquement → coller + 💾 + 🏔️ UTMB › Mettre à jour la structure (pas de New version)

## V1.9.0 — Déblocage personnel, dossard vérifié, message matos
- Nouvelle colonne Etapes « debloquer_si » : section verrouillée pour chaque invité tant qu'il n'a pas répondu au formulaire
  indiqué (ex. « presence » ou « presence=Oui ») ; débloquée instantanément après l'envoi, badge « Nouveau » 48 h
- Dossard et déblocages vérifiés auprès du Sheet à chaque visite : réponse effacée dans le Sheet → dossard retiré de l'appareil
- Chaque envoi porte un jeton d'appareil (colonne « jeton » des onglets Reponses_…) ; renvoi depuis le même appareil = même dossard
- Réponse « Non » à la présence : pas de dossard affiché
- Hébergement : « Merci, c'est bien reçu ! N'oublie pas de vérifier ton matos ! 🎒👟🔦⛰️ » (FR/IT/ES)
- ⚠️ Code.gs modifié → coller + 💾 + New version + 🏔️ UTMB › Mettre à jour la structure

## V1.8.0 — Bandeaux iOS, carte plus haute, pastilles « Nouveau »
- Bandeaux photos : défilement piloté en JavaScript (les animations CSS se figeaient sur iPhone/iPad) ;
  pause au survol ou au toucher, arrêt automatique hors écran
- Téléphone : pastille « Nouveau » en bas à droite de l'en-tête d'étape et des cartes du panneau, dans une zone sans texte
- Carte 3D : vue d'ouverture plus haute et plus large (zoom 9.4, inclinaison 55) ; téléphone automatiquement encore plus large
  (nouvelle ligne Parametres « carte_zoom_mobile » pour un réglage précis)
- Départ / arrivée : chevauchement plus serré (3D et 2D)
- Code.gs : migration automatique de carte_zoom 10.1 → 9.4 et carte_inclinaison 62 → 55 (si valeurs d'origine) + ligne carte_zoom_mobile
  → coller + 💾 + 🏔️ UTMB › Mettre à jour la structure

## V1.7.0 — Cadrage de l'accueil, pastilles « Nouveau », appli M&L
- Photo d'accueil : cadrage réglable depuis le Sheet (Parametres : accueil_position_h, accueil_position_v, accueil_zoom,
  + accueil_position_h_mobile / accueil_position_v_mobile pour un cadrage différent sur téléphone)
- Carte 3D et 2D : départ et arrivée qui se chevauchent, arrivée légèrement à gauche, départ devant
- Pastille « Nouveau » aussi dans le bandeau du haut (texte sur ordinateur, point rouge sur les pastilles téléphone)
- Téléphone : la pastille « Nouveau » se pose en bas à droite de la pastille numérotée (étapes + panneau de la carte),
  plus de chevauchement avec le texte ; ordinateur : réserve de place à droite du titre de l'étape
- Nom de l'appli installée : « M&L »
- Code.gs : nouvelles lignes Parametres (cadrage) + étape Hébergement « nouveau » par défaut
  → coller + 💾 + 🏔️ UTMB › Mettre à jour la structure (pas de nouveau déploiement nécessaire)

## V1.6.0 — Accueil plein écran, visionneuse, carte
- Accueil : photo de nouveau en plein écran (recadrée), avec le léger zoom lent d'origine
- Bouton « Installer l'appli » déplacé dans le bandeau supérieur, à gauche des étapes (icône 📲 seule sur téléphone)
- Carte 3D et 2D : l'arrivée (marqueur superposé au départ) est toujours affichée à gauche du départ, quelle que soit l'orientation
- Visionneuse photo : flèches ‹ › pour passer d'une photo à l'autre (bandeaux, photos d'étapes, galerie), compteur « 3 / 7 »,
  flèches du clavier, glisser du doigt sur téléphone ; photos des bandeaux dédoublonnées
- Code.gs inchangé (pas de redéploiement)

## V1.5.1 — Renommage
- « Ultra Trail du Mariage Bossi » partout (titre d'onglet, accueil, pied de page, données de démo, Code.gs)
- ⚠️ Le sous-titre affiché vient du Sheet : Parametres › sous_titre à modifier à la main

## V1.5.0 — Accueil, 2D aérienne, hébergements
- Accueil : photo affichée en entier (plus de recadrage ni d'effet zoom), bords comblés par la même photo floutée
- Bouton « Prendre le départ » : en bas de la fenêtre (ordinateur), à cheval entre la photo et le site (téléphone)
- Bouton « Installer l'appli » : discret, en haut à gauche sous U·T·M·B et les drapeaux
- Carte 2D : photo aérienne du massif (tuiles satellite Esri, sans WebGL), niveau de détail adapté à l'écran
- Hébergements : une ligne par hébergement ; bandeau photo défilant entre la liste et le formulaire (dossier Drive « hebergement »)
- Bandeaux défilants : photos répétées pour toujours remplir la largeur, vitesse adaptée au nombre de photos
- Nom de l'appli installée : « Wedding L&M »
- Données de démonstration : étapes 4 et 5 inversées (Programme puis Plan du site)
- Livraison sans dossier icons ni cles.exemple.js
- Code.gs inchangé (pas de redéploiement)

## V1.4.1 — Performance & corrections
- Chargement : accueil (titres, compte à rebours, altimètre) affiché immédiatement, sans attendre les données
- Visites suivantes instantanées : affichage depuis la mémoire du téléphone, mise à jour en arrière-plan
- Carte 3D (MapLibre ~800 Ko + tuiles) chargée seulement à l'approche de la section Parcours
- Polices non bloquantes, photos Drive téléchargées à la taille de l'écran
- Plus de « #parcours » collé à l'adresse : le site s'ouvre toujours sur l'accueil
- Requête de données lancée pendant la saisie du code d'accès
- Apps Script : cache 6 h vidé automatiquement à chaque modification du Sheet, liste des photos en cache,
  plus de contrôle de partage photo par photo à chaque visite, préchauffage toutes les 10 min
- Corrections mobile : options de choix qui débordaient, pastilles (anneau coupé), compte à rebours et
  accueil qui dépassaient sur petits écrans (320 px), dossard qui chevauchait les boutons
- Corrections : écouteurs/minuteurs dupliqués lors d'un nouveau rendu, message « touchez à nouveau » parasite
  au lancement, données conservées si l'invité est en train de remplir un formulaire
- ⚠️ Code.gs modifié → coller + New version + 🏔️ UTMB › Mettre à jour la structure (active le préchauffage)

## V1.4.0 — Formulaires pilotés par le Sheet
- Nouvel onglet « Questions » : ajouter / modifier / masquer / réordonner les questions sans toucher au code
- 10 types : texte, texte_long, email, telephone, nombre (min;max), date, ouinon, choix, cases, liste
- Questions obligatoires (astérisque, envoi bloqué, contrôle aussi côté serveur), valeurs par défaut, textes d'aide
- Questions conditionnelles (afficher_si : presence=Oui, id!=valeur, A|B)
- Nouveaux formulaires sans code : type « formulaire:nom » dans l'onglet Etapes → réponses dans « Reponses_Nom »
- Colonnes de réponses ajoutées automatiquement ; aucune colonne ni réponse supprimée
- Questions, aides et options traduites automatiquement (corrections : question_it, aide_es, options_it…)
- « Ultra Trail des Mariés Bossi » n'est plus traduit (identique en FR / IT / ES)
- ⚠️ Code.gs modifié → coller + New version + 🏔️ UTMB › Mettre à jour la structure

## V1.3.0 — Compte à rebours altimétrique, 2D, appli, mobile
- « Ultra Trail des Mariés Bossi » partout (titre d'onglet, accueil, pied de page, démo, appli)
- Compte à rebours vers le 24/07/2027 (date du Sheet prioritaire) + altimètre : l'altitude monte de Chamonix (1 035 m) au sommet du Mont Blanc au fil des jours
- Carte 2D de secours : automatique sur les appareils sans 3D ou peu puissants, + bouton 2D / 3D
- Site installable en appli (bouton « Installer l'appli » ; instructions dédiées sur iPhone)
- Drapeau chilien pour l'espagnol ; textes d'interface en espagnol d'Amérique latine (ustedes)
- Carte : l'étape 1 passe devant l'arrivée verrouillée (marqueurs superposés décalés)
- Mobile : étapes en pastilles numérotées dans le bandeau du haut, toutes visibles d'un coup, avec suivi de la section en cours
- Code.gs : textes par défaut uniquement (redéploiement facultatif)

## V1.2.0 — Process allégé + correctifs
- Drapeaux réparés, réglages de carte dans le Sheet, cles.js, anti-cache, correctifs de traduction

## V1.1.0 — Vue Chamonix & multilingue
## V1.0.0 — Lancement
