(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StormPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HOME_TYPES = ['house', 'condo', 'apartment', 'mobile'];
  var HOME_LABELS = {
    house: 'Single-family house or townhome',
    condo: 'Condo',
    apartment: 'Apartment',
    mobile: 'Mobile or manufactured home'
  };

  var DEFAULT_PROFILE = {
    adults: 2,
    seniors: 0,
    children: 0,
    infants: 0,
    pets: 0,
    days: 7,
    homeType: 'house',
    shutters: false,
    generator: false,
    needsMeds: false,
    powerMedical: false,
    mobility: false
  };

  var RESOURCES = [
    { label: 'National Hurricane Center', url: 'https://www.nhc.noaa.gov/' },
    { label: 'NWS Miami (South Florida forecasts)', url: 'https://www.weather.gov/mfl/' },
    { label: 'Florida Division of Emergency Management', url: 'https://www.floridadisaster.org/' },
    { label: 'Florida disaster supply kit checklist', url: 'https://www.floridadisaster.org/Kit' },
    { label: 'Ready.gov: Hurricanes', url: 'https://www.ready.gov/hurricanes' }
  ];

  function clampInt(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function plural(n, word, pluralWord) {
    return n + ' ' + (n === 1 ? word : (pluralWord || word + 's'));
  }

  function normalizeProfile(input) {
    var p = input || {};
    var d = DEFAULT_PROFILE;
    var out = {
      adults: clampInt(p.adults, 0, 20, d.adults),
      seniors: clampInt(p.seniors, 0, 20, d.seniors),
      children: clampInt(p.children, 0, 20, d.children),
      infants: clampInt(p.infants, 0, 20, d.infants),
      pets: clampInt(p.pets, 0, 20, d.pets),
      days: clampInt(p.days, 1, 14, d.days),
      homeType: HOME_TYPES.indexOf(p.homeType) >= 0 ? p.homeType : d.homeType,
      shutters: !!p.shutters,
      generator: !!p.generator,
      needsMeds: !!p.needsMeds,
      powerMedical: !!p.powerMedical,
      mobility: !!p.mobility
    };
    if (out.adults + out.seniors + out.children + out.infants === 0) out.adults = 1;
    return out;
  }

  function item(id, text, opts) {
    opts = opts || {};
    return { id: id, text: text, qty: opts.qty || '', detail: opts.detail || '' };
  }

  function buildPlan(input) {
    var p = normalizeProfile(input);
    var people = p.adults + p.seniors + p.children + p.infants;
    var eaters = people - p.infants; 
    var days = p.days;

    var waterGallons = Math.ceil(people * days + p.pets * days * 0.5);
    var meals = eaters * days * 3;
    var diapers = p.infants * days * 10;
    var lights = Math.max(2, people);
    var phones = Math.max(1, eaters);

    var supplies = [
      item('water', 'Drinking water', {
        qty: plural(waterGallons, 'gallon'),
        detail: '1 gallon per person per day, for drinking and sanitation, for ' + plural(people, 'person', 'people') +
          ' × ' + plural(days, 'day') +
          (p.pets ? ', plus a rough estimate of half a gallon per pet per day for ' + plural(p.pets, 'pet') +
            '. Small pets need less. A large dog may need closer to a gallon a day.' : '.')
      }),
      item('food', 'Non-perishable food', {
        qty: plural(meals, 'meal'),
        detail: '3 meals a day for ' + plural(eaters, 'person', 'people') + ' for ' + plural(days, 'day') +
          '. Pick food that needs no cooking: canned goods, peanut butter, granola bars, dried fruit.'
      }),
      item('opener', 'Manual can opener'),
      item('lights', 'Flashlights', {
        qty: String(lights),
        detail: 'Use flashlights, not candles. Candles are a fire risk.'
      }),
      item('batteries', 'Extra batteries', { detail: 'In the sizes your flashlights and radio use.' }),
      item('radio', 'Battery-powered or hand-crank radio', {
        detail: 'A NOAA Weather Radio with tone alert is ideal. It works when cell service and internet do not. Keep extra batteries for it.'
      }),
      item('powerbank', 'Power banks, fully charged', {
        qty: String(phones),
        detail: 'Roughly one per phone.'
      }),
      item('firstaid', 'First-aid kit'),
      item('hygiene', 'Toilet paper, soap, hand sanitizer, wipes, trash bags'),
      item('toilet', 'Emergency toilet supplies', {
        detail: 'A bucket with a tight-fitting lid, heavy trash bags and cat litter, in case water service stops.'
      }),
      item('purify', 'Water purification tablets or unscented household bleach', {
        detail: 'For water that may not be safe to drink. Follow the product label or the instructions on Ready.gov.'
      }),
      item('whistle', 'Whistle to signal for help'),
      item('mask', 'Dust masks', {
        qty: String(people),
        detail: 'Helps filter dust and debris during cleanup. One per person.'
      }),
      item('bedding', 'Blanket or sleeping bag for each person', {
        qty: String(people)
      }),
      item('clothes', 'A full change of clothes and sturdy shoes for each person', {
        detail: 'Sturdy shoes protect feet from debris and sharp objects after a storm.'
      }),
      item('cooler', 'Cooler plus ice or freezer packs'),
      item('tools', 'Multi-tool, duct tape, plastic sheeting, work gloves'),
      item('extinguisher', 'Fire extinguisher (and know how to use it)'),
      item('repellent', 'Insect repellent', {
        detail: 'Standing water brings mosquitoes after a storm.'
      })
    ];

    var household = [
      item('buddy', 'Pick a check-in buddy', {
        detail: 'A neighbor or relative who will check on you after a storm, and who you will check on in return.'
      })
    ];
    if (p.infants > 0) {
      household.push(item('infant-food', 'Formula or baby food', {
        qty: days + '-day supply',
        detail: 'Enough for ' + plural(p.infants, 'infant') + '. Ready-to-feed formula needs no clean water.'
      }));
      household.push(item('diapers', 'Diapers and wipes', {
        qty: String(diapers),
        detail: 'A rough estimate of about 10 a day per infant. Adjust for your baby\'s age.'
      }));
    }
    if (p.children > 0) {
      household.push(item('kids', 'Comfort items, books, cards and offline games', {
        detail: 'For ' + plural(p.children, 'child', 'children') + '. Storms and outages are easier when there is something to do.'
      }));
    }
    if (p.seniors > 0) {
      household.push(item('senior-items', 'Extra glasses, hearing-aid batteries and denture supplies', {
        detail: 'Plus a written list of every medication, doctor and allergy for ' + plural(p.seniors, 'older adult') + '.'
      }));
    }
    if (p.needsMeds) {
      household.push(item('meds', 'Prescription medicine', {
        qty: days + '-day supply or more',
        detail: 'Refill early in hurricane season. Keep medicine in a waterproof bag with a written list of doses. Ask your pharmacist how to keep refrigerated medicine cold.'
      }));
    }
    if (p.powerMedical) {
      household.push(item('power-medical', 'Backup power plan for medical equipment', {
        detail: 'Oxygen, CPAP, refrigerated medicine and similar needs. Talk to your doctor and your power company before a storm. Ask your county emergency management office about its Special Needs Registry.'
      }));
      household.push(item('power-medical-battery', 'Charged backup batteries for medical devices', {
        detail: 'If losing power would be dangerous, plan to go somewhere with power early.'
      }));
    }
    if (p.mobility) {
      household.push(item('mobility', 'Plan how to get out if elevators or roads are not usable', {
        detail: 'Decide who will help, and keep walkers, wheelchairs and their chargers ready to go. Register with your county emergency management office\'s special needs registry so responders know to check on you.'
      }));
    }
    if (p.pets > 0) {
      household.push(item('pet-food', 'Pet food and medicine', {
        qty: days + '-day supply per pet',
        detail: 'For ' + plural(p.pets, 'pet') + '.'
      }));
      household.push(item('pet-carrier', 'Carrier or leash, vaccination records and a recent photo of each pet'));
      household.push(item('pet-shelter', 'Find a pet-friendly place to stay', {
        detail: 'Many public shelters do not take pets. Ask your county which ones do, before a storm threatens.'
      }));
    }

    var home = [];
    if (p.homeType === 'mobile') {
      home.push(item('mobile-warning', 'Plan to leave a mobile or manufactured home', {
        detail: 'These homes are not safe in hurricane-force winds, even when tied down. Choose a sturdier building or shelter now, and leave early when officials advise.'
      }));
    }
    if (p.homeType === 'condo' || p.homeType === 'apartment') {
      home.push(item('building-plan', 'Learn your building\'s storm plan', {
        detail: 'Ask management about shutters, where to shelter inside the building, whether elevators will work, and whether there is a generator.'
      }));
    }
    if (p.shutters) {
      home.push(item('shutters-test', 'Find and test your shutters or impact-window hardware', {
        detail: 'Make sure every panel, track and bolt is there before a storm threatens.'
      }));
    } else {
      home.push(item('shutters-buy', 'Make a plan to cover your windows', {
        detail: 'Install shutters, or buy and pre-cut plywood or panels early. Stores sell out once a storm is in the forecast. Tape does not protect windows.'
      }));
    }
    if (p.homeType === 'house') {
      home.push(item('yard', 'Trim dead branches and decide where outdoor items will go', {
        detail: 'Patio furniture, grills, trash bins and potted plants become projectiles in high wind.'
      }));
    }
    home.push(item('flood', 'Know your flood risk', {
      detail: 'Much of South Florida is low-lying, so storm surge and heavy rain can flood a street or home that has never flooded before. Think about where you would move valuables off the floor. Never drive through flooded roads. Turn around, don\'t drown.'
    }));
    home.push(item('smoke', 'Check smoke alarm batteries'));
    home.push(item('co-detector', 'Battery-powered carbon monoxide detector', {
      detail: 'Generators and grills used near a home are a major cause of storm-related carbon monoxide poisoning.'
    }));
    if (p.generator) {
      home.push(item('gen-safety', 'Run your generator outside only, far from doors and windows', {
        detail: 'Never run it in a garage, even with the door open. Carbon monoxide can kill in minutes.'
      }));
      home.push(item('gen-fuel', 'Store fuel safely and test the generator', {
        detail: 'Use approved fuel containers kept outside living space and away from heat.'
      }));
    }

    var documents = [
      item('docs-ids', 'Copies of IDs, insurance policies, deed or lease, and medical information', {
        detail: 'Keep them in a waterproof bag, and save photos to cloud storage or email them to yourself.'
      }),
      item('docs-photos', 'Photo or video inventory of your home and belongings', {
        detail: 'Makes insurance claims much easier.'
      }),
      item('insurance', 'Check your wind and flood coverage', {
        detail: 'Standard homeowners policies usually do not cover flood damage, and flood policies often have a waiting period (typically 30 days for federal flood insurance), so do not wait for a storm. Ask your insurance agent.'
      }),
      item('cash', 'Cash in small bills', {
        detail: 'ATMs and card readers may not work during an outage.'
      }),
      item('contacts-paper', 'Printed list of important phone numbers', {
        detail: 'Use the Family plan tab to build and print one.'
      })
    ];

    var evac = [
      item('zone', 'Look up whether your home is in an evacuation zone', {
        detail: 'Miami-Dade, Broward, Palm Beach and Monroe counties each have a zone lookup on their emergency management website, and the Florida Division of Emergency Management has a statewide "Know Your Zone" tool. Zones are based on storm surge, not wind, so a home far from the coast may not be in one. In the Keys, US-1 is the main road out, so evacuation orders usually come earlier than on the mainland. If officials order an evacuation for your area, go.'
      }),
      item('destination', 'Choose where you would go and two routes to get there', {
        detail: 'Friends or family inland, a hotel, or a public shelter. Leave early to beat traffic and gas lines.'
      }),
      item('oop-contact', 'Pick an out-of-area contact everyone can check in with', {
        detail: 'Texts often get through when calls do not.'
      }),
      item('meet', 'Agree on a meeting place near home and one outside your neighborhood'),
      item('alerts-signup', 'Turn on Wireless Emergency Alerts and sign up for your county\'s alerts'),
      item('go-bag', 'Pack a go-bag for each person', {
        detail: 'That is ' + plural(people, 'bag') + ' for your household. Include clothes, medicine, chargers, copies of documents, water and snacks.'
      })
    ];

    var watch = [
      item('w-fuel', 'Fill your car\'s gas tank'),
      item('w-charge', 'Charge phones, power banks and medical devices'),
      item('w-fridge', 'Set the fridge and freezer to their coldest settings', {
        detail: 'Helps food stay safe longer if the power goes out.'
      }),
      item('w-water', 'Fill bathtubs and large containers with water', {
        detail: 'For flushing and cleaning, not for drinking.'
      }),
      item('w-outdoor', 'Bring in or tie down everything outside'),
      item('w-shutters', 'Close shutters or cover your windows'),
      item('w-prep', 'Pick up prescriptions and cash'),
      item('w-room', 'Choose your safe room', {
        detail: 'An interior room away from windows, on a floor that will not flood.'
      }),
      item('w-evac', 'If officials order an evacuation, leave', {
        detail: 'Take your go-bags, medicine, pets and documents.'
      })
    ];
    if (p.pets > 0) {
      watch.splice(7, 0, item('w-pets', 'Make sure every pet has an ID tag, and keep them with you'));
    }

    var after = [
      item('a-clear', 'Wait for the official all-clear before going outside'),
      item('a-lines', 'Stay far away from downed power lines, and report them'),
      item('a-water', 'Stay out of floodwater', {
        detail: 'It can hide debris and carry contamination.'
      }),
      item('a-photos', 'Photograph damage before you clean up'),
      item('a-food', 'When in doubt, throw it out', {
        detail: 'Discard food that may have spoiled during the outage.'
      }),
      item('a-gen', 'Use generators, grills and camp stoves outdoors only'),
      item('a-neighbors', 'Check on neighbors, especially older adults and people with medical needs'),
      item('a-mosq', 'Dump standing water to cut down on mosquitoes'),
      item('a-boil', 'Check for boil-water notices before drinking tap water')
    ];

    var sections = [
      { id: 'supplies', title: 'Stock your supplies', blurb: 'Build a ' + days + '-day kit.' +
          (days < 7 ? ' Florida emergency officials recommend at least 7 days of supplies.' : '') +
          ' Quantities follow Ready.gov and the Florida Division of Emergency Management. Pet water and diaper counts are estimates.',
        items: supplies },
      { id: 'household', title: 'Your household\'s needs', blurb: 'Based on who lives with you.', items: household },
      { id: 'home', title: 'Protect your home', blurb: 'Based on your type of home.', items: home },
      { id: 'documents', title: 'Documents and money', blurb: '', items: documents },
      { id: 'evac', title: 'Plan to leave, just in case', blurb: '', items: evac },
      {
        id: 'watch', title: 'When a hurricane watch is issued',
        blurb: 'A watch means hurricane conditions are possible within about 48 hours. A warning means they are expected within about 36 hours. Finish your prep when the watch is issued.',
        items: watch
      },
      { id: 'after', title: 'After the storm', blurb: '', items: after }
    ];

    return {
      profile: p,
      summary: {
        people: people,
        pets: p.pets,
        days: days,
        waterGallons: waterGallons,
        meals: meals,
        diapers: diapers,
        flashlights: lights,
        goBags: people
      },
      sections: sections,
      resources: RESOURCES
    };
  }

  function allItemIds(plan) {
    var ids = [];
    plan.sections.forEach(function (s) {
      s.items.forEach(function (i) { ids.push(i.id); });
    });
    return ids;
  }

  function progress(plan, checked) {
    var ids = allItemIds(plan);
    var done = 0;
    ids.forEach(function (id) { if (checked && checked[id]) done++; });
    return {
      done: done,
      total: ids.length,
      percent: ids.length ? Math.round((done / ids.length) * 100) : 0
    };
  }

  function sectionProgress(section, checked) {
    var done = 0;
    section.items.forEach(function (i) { if (checked && checked[i.id]) done++; });
    return { done: done, total: section.items.length };
  }

  function plainText(plan, checked) {
    var s = plan.summary;
    var lines = [];
    lines.push('Hurricane prep checklist: ' + plural(s.people, 'person', 'people') +
      (s.pets ? ', ' + plural(s.pets, 'pet') : '') + ', ' + plural(s.days, 'day') + ' of supplies');
    lines.push('');
    plan.sections.forEach(function (sec) {
      lines.push(sec.title.toUpperCase());
      sec.items.forEach(function (i) {
        var mark = checked && checked[i.id] ? '[x]' : '[ ]';
        lines.push(mark + ' ' + (i.qty ? i.qty + ': ' : '') + i.text);
      });
      lines.push('');
    });
    return lines.join('\n').replace(/\s+$/, '') + '\n';
  }

  return {
    DEFAULT_PROFILE: DEFAULT_PROFILE,
    HOME_TYPES: HOME_TYPES,
    HOME_LABELS: HOME_LABELS,
    RESOURCES: RESOURCES,
    normalizeProfile: normalizeProfile,
    buildPlan: buildPlan,
    allItemIds: allItemIds,
    progress: progress,
    sectionProgress: sectionProgress,
    plainText: plainText
  };
});
