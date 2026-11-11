# COACH — Référence visuelle verrouillée

## Statut
Visuel maître validé par Lorenzo. Toute future pose doit conserver strictement cette identité graphique.

## Identité visuelle
- Personnage : marmotte cartoon semi-réaliste, style alpin chic.
- Lunettes : masque de trail très visuel, grand écran miroir orange/rouge.
- Casquette : vert forêt, portée à l’envers.
- Gilet : gilet de trail/hydratation vert forêt, détails orange/terracotta.
- Chaussures : trail olive/terracotta, semelle crantée.
- Accessoire : montre GPS.
- Dossard : blanc, avec `U.T.M.B.`, `Ultra Trail du Mariage Bossi`, grand texte `COACH`.
- Palette : vert forêt, beige/crème, doré, terracotta.
- Attitude : personnage sportif, expressif, sympathique, lisible à petite taille.

## Règles de continuité
1. Ne jamais redessiner Coach depuis zéro lorsqu’un asset de référence est disponible.
2. Utiliser `coach_reference.webp` comme source visuelle de toute nouvelle pose.
3. Ne modifier que la pose, la gestuelle ou l’accessoire demandé.
4. Conserver visage, morphologie, fourrure, lunettes, casquette, gilet, chaussures, montre et dossard.
5. Les pancartes doivent rester vierges dans les assets. Leur texte est ajouté par le site en HTML pour FR / IT / ES.
6. Aucun son automatique.
7. Les assets Coach ne doivent pas ralentir le chargement initial : chargement différé uniquement.

## Assets prévus
- `coach_reference.webp` — visuel maître approuvé
- `coach_coucou.webp`
- `coach_jumelles.webp`
- `coach_montre.webp`
- `coach_ravito.webp`
- `coach_dossard.webp`
- `coach_deblocage.webp`
- `coach_matos.webp`

## Comportements web prévus
- 4 apparitions aléatoires : coucou, jumelles, montre, ravito.
- 3 apparitions événementielles : dossard attribué, nouvelle étape débloquée, hébergement validé.
- Maximum 3 apparitions aléatoires par visite.
- Première apparition après 25–50 s, suivantes après 2–5 min.
- Jamais pendant la saisie d’un formulaire, pendant la visionneuse photo ou sur l’écran du code d’accès.
- Respect de `prefers-reduced-motion`.
- Chargement différé : aucun asset Coach dans le chemin critique du premier affichage.

## Étape manuelle indispensable
Enregistrer l’image de Coach validée dans ce dossier sous le nom exact `coach_reference.webp` avant de générer les variantes.
