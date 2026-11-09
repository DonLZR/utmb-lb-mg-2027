# UTMB – Journal des versions

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
