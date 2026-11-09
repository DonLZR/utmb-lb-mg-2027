/* =========================================================
   UTMB – Ultra Trail du Mariage Bossi — config.js
   Tes clés sont dans cles.js (jamais livré). Les réglages du Sheet
   (onglet Parametres) priment sur les valeurs ci-dessous.
   ========================================================= */
window.UTMB_CONFIG = {
  version: "1.5.1",

  apiUrl: (window.UTMB_CLES && window.UTMB_CLES.apiUrl) || "",
  accessCodeHash: (window.UTMB_CLES && window.UTMB_CLES.accessCodeHash) || "",

  /* Langues proposées (la 1re = langue par défaut) — "es" = espagnol (drapeau chilien) */
  langues: ["fr", "it", "es"],

  /* Compte à rebours + altimètre
     dateMariage : utilisée si la ligne date_mariage du Sheet est vide
     departChrono : date à laquelle l'altimètre part de Chamonix */
  dateMariage: "2027-07-24T00:00",
  departChrono: "2026-11-01T00:00",
  altitudeDepart: 1035,   // Chamonix
  altitudeSommet: 4805,   // Mont Blanc (mesure 2023 : 4 805,59 m)

  /* Carte 3D — valeurs par défaut (vue depuis Chamonix vers le Mont Blanc / l'Italie) */
  map: {
    center: [6.92, 45.86],   // [longitude, latitude]
    zoom: 10.1,
    pitch: 62,
    bearing: 162,
    exaggeration: 1.5
  },

  /* Tracé du parcours (boucle UTMB simplifiée) [longitude, latitude] */
  route: [
    [6.8694,45.9237],[6.7986,45.8907],[6.7600,45.8820],[6.7125,45.8925],
    [6.7273,45.8213],[6.7210,45.7930],[6.7139,45.7239],[6.7350,45.6965],
    [6.8072,45.7514],[6.8380,45.7660],[6.8800,45.7710],[6.9722,45.7917],
    [6.9830,45.8070],[7.0420,45.8640],[7.0472,45.8851],[7.0950,45.9330],
    [7.1150,45.9850],[7.1170,46.0300],[7.0550,46.0500],[6.9930,46.0560],
    [6.9330,46.0330],[6.9240,45.9980],[6.8900,45.9600],[6.8760,45.9300]
  ],

  /* Données de démonstration (utilisées tant que apiUrl est vide) */
  demo: {
    parametres: {
      titre: "U.T.M.B.",
      sous_titre: "Ultra Trail du Mariage Bossi",
      prenoms: "[Prénom] & [Prénom]",
      date_mariage: "",
      lieu: "Bretagne — [à compléter]",
      message_accueil: "Chaussez vos baskets : la course la plus folle de l'année se prépare. Suivez le parcours, débloquez les ravitos au fil de nos annonces… et rendez-vous sur la ligne d'arrivée !",
      date_limite_reponse: "[à compléter]"
    },
    etapes: [
      { id:"etape-1", ordre:1, cp:"Départ", lieu:"Chamonix", km:0, altitude:1035, titre:"Le Départ", sous_titre:"Retrait des dossards", type:"texte", statut:"ouvert", indice:"", lat:45.9237, lng:6.8694,
        contenu:"Bienvenue sur la ligne de départ !\n\nOn se marie… en **Bretagne**, mais notre cœur bat au rythme des sentiers du Mont-Blanc. Ce site est votre carnet de course : chaque ravitaillement se débloquera au fil de nos annonces.", lien_libelle:"", lien_url:"" },
      { id:"etape-2", ordre:2, cp:"Ravito 1", lieu:"Les Contamines", km:31, altitude:1150, titre:"Présence", sous_titre:"Confirmez votre inscription", type:"presence", statut:"nouveau", indice:"", lat:45.8213, lng:6.7273,
        contenu:"Pas de dossard sans inscription ! Dites-nous si vous serez sur la ligne de départ.", lien_libelle:"", lien_url:"" },
      { id:"etape-3", ordre:3, cp:"Refuge", lieu:"Courmayeur", km:81, altitude:1190, titre:"Hébergement", sous_titre:"Où poser le sac", type:"hebergement", statut:"ouvert", indice:"", lat:45.7917, lng:6.9722,
        contenu:"Voici quelques adresses pour récupérer après l'effort.", lien_libelle:"", lien_url:"" },
      { id:"etape-4", ordre:4, cp:"Ravito 2", lieu:"Champex-Lac", km:126, altitude:1470, titre:"Programme", sous_titre:"Le Jour J minute par minute", type:"programme", statut:"verrouille", indice:"Débloqué prochainement", lat:46.0300, lng:7.1170,
        contenu:"", lien_libelle:"", lien_url:"" },
      { id:"etape-5", ordre:5, cp:"Arrivée", lieu:"Chamonix", km:171, altitude:1035, titre:"Plan du site", sous_titre:"Repérage du terrain", type:"plan", statut:"verrouille", indice:"Débloqué prochainement", lat:45.9300, lng:6.8760,
        contenu:"", lien_libelle:"", lien_url:"" }
    ],
    hebergements: [
      { nom:"[Hébergement 1]", type:"Hôtel", distance:"[x] km", prix:"[à compléter]", lien:"", description:"[à compléter]" },
      { nom:"[Hébergement 2]", type:"Gîte", distance:"[x] km", prix:"[à compléter]", lien:"", description:"[à compléter]" }
    ],
    programme: [],
    photos: {},
    /* Formulaires de secours (mode démo ou Code.gs pas encore mis à jour).
       En temps normal, les questions viennent de l'onglet « Questions » du Sheet. */
    formulaires: {
      presence: [
        { id:"nom", question:"Nom & prénom", type:"texte", obligatoire:true },
        { id:"email", question:"E-mail", type:"email" },
        { id:"presence", question:"Serez-vous sur la ligne de départ ?", type:"choix", obligatoire:true,
          options:[{ v:"Oui", l:"🏃 Je prends le départ !" }, { v:"Non", l:"🫶 Abandon… mais de tout cœur avec vous" }] },
        { id:"adultes", question:"Nombre d'adultes", type:"nombre", min:0, max:20, defaut:1, obligatoire:true, si:"presence=Oui" },
        { id:"enfants", question:"Nombre d'enfants", type:"nombre", min:0, max:20, defaut:0, si:"presence=Oui" },
        { id:"regime", question:"Régime alimentaire / allergies", type:"texte", aide:"Végétarien, sans gluten…", si:"presence=Oui" },
        { id:"message", question:"Un mot pour les mariés", type:"texte_long" }
      ],
      hebergement: [
        { id:"nom", question:"Nom & prénom", type:"texte", obligatoire:true },
        { id:"personnes", question:"Nombre de personnes", type:"nombre", min:1, max:20, defaut:2 },
        { id:"besoin", question:"Votre besoin", type:"liste", obligatoire:true, options:[
          { v:"Je souhaite une proposition d'hébergement", l:"Je souhaite une proposition d'hébergement" },
          { v:"Je réserve moi-même", l:"Je réserve moi-même" },
          { v:"Je n'ai pas besoin d'hébergement", l:"Je n'ai pas besoin d'hébergement" }] },
        { id:"nuits", question:"Nuits concernées", type:"texte", aide:"Ex. vendredi + samedi" },
        { id:"commentaire", question:"Commentaire", type:"texte_long" }
      ]
    }
  }
};
