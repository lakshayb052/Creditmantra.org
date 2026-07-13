const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DEFAULT_CSV_TEMPLATE = JSON.stringify([
  { id: "urn", header: "URN", source: "urn" },
  { id: "created_at", header: "Creation Date/Time", source: "created_at" },
  { id: "full_name", header: "Full Name", source: "full_name" },
  { id: "phone", header: "Phone", source: "phone" },
  { id: "email", header: "Email", source: "email" },
  { id: "pan_no", header: "PAN Number", source: "pan_no" },
  { id: "city", header: "City", source: "city" },
  { id: "employment", header: "Employment", source: "employment" },
  { id: "income_range", header: "Monthly Income", source: "income_range" },
  { id: "card_name", header: "Selected Card", source: "card_name" },
  { id: "card_bank", header: "Card Bank", source: "card_bank" },
  { id: "source", header: "Source", source: "source" },
  { id: "utm_source", header: "UTM Source", source: "utm_source" },
  { id: "utm_info", header: "UTM Info", source: "utm_info" },
  { id: "utm_creative_format", header: "UTM Creative Format", source: "utm_creative_format" },
  { id: "utm_medium", header: "UTM Medium", source: "utm_medium" },
  { id: "utm_campaign", header: "UTM Campaign", source: "utm_campaign" },
  { id: "utm_term", header: "UTM Term", source: "utm_term" },
  { id: "utm_content", header: "UTM Content", source: "utm_content" },
  { id: "utm_channel", header: "UTM Channel", source: "utm_channel" },
  { id: "utm_category", header: "UTM Category", source: "utm_category" },
  { id: "utm_id", header: "UTM Campaign ID (utm_id)", source: "utm_id" },
  { id: "utm_creative", header: "UTM Ad ID (utm_creative)", source: "utm_creative" },
  { id: "utm_internal", header: "UTM Internal (utm_internal)", source: "utm_internal" },
  { id: "utm_keyword", header: "UTM Keyword (utm_keyword)", source: "utm_keyword" },
  { id: "utm_matchtype", header: "UTM Matchtype (utm_matchtype)", source: "utm_matchtype" },
  { id: "utm_network", header: "UTM Network (utm_network)", source: "utm_network" },
  { id: "utm_placement", header: "UTM Placement (utm_placement)", source: "utm_placement" },
  { id: "utm_device", header: "UTM Device (utm_device)", source: "utm_device" },
  { id: "utm_location", header: "UTM Location (utm_location)", source: "utm_location" },
  { id: "gbraid", header: "GBRAID (gbraid)", source: "gbraid" },
  { id: "wbraid", header: "WBRAID (wbraid)", source: "wbraid" },
  { id: "landing_page", header: "Landing Page (landing_page)", source: "landing_page" },
  { id: "first_landing_page", header: "First Landing Page (first_landing_page)", source: "first_landing_page" },
  { id: "referrer", header: "Referrer (referrer)", source: "referrer" },
  { id: "fbclid", header: "FBCLID", source: "fbclid" },
  { id: "gclid", header: "GCLID", source: "gclid" },
  { id: "gclsrc", header: "GCLSRC", source: "gclsrc" },
  { id: "dclid", header: "DCLID", source: "dclid" },
  { id: "msclkid", header: "MSCLKID", source: "msclkid" },
  { id: "ttclid", header: "TTCLID", source: "ttclid" },
  { id: "twclid", header: "TWCLID", source: "twclid" },
  { id: "li_fat_id", header: "LI_FAT_ID", source: "li_fat_id" },
  { id: "utm_params", header: "All Tracking Parameters (JSON)", source: "utm_params" },
  { id: "agent_name", header: "Agent Name", source: "agent_name" },
  { id: "agent_location", header: "Agent Location", source: "agent_location" },
  { id: "redirect_url", header: "Redirect URL", source: "redirect_url" },
  { id: "has_credit_card", header: "Already Has Credit Card?", source: "has_credit_card" },
  { id: "pincode", header: "Residence Pincode", source: "pincode" },
  { id: "monthly_income", header: "Monthly Income", source: "monthly_income" },
  { id: "dob", header: "Date of Birth", source: "dob" },
  { id: "mother_name", header: "Mother's Name", source: "mother_name" },
  { id: "current_address", header: "Current Address", source: "current_address" },
  { id: "designation", header: "Designation", source: "designation" }
]);

const rawDbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim().replace(/^["']|["']$/g, '') : '';

if (!rawDbUrl) {
  console.error('====================================================================');
  console.error('[Database] CRITICAL: DATABASE_URL is not set in environment / .env file!');
  console.error('[Database] MongoDB Atlas database has been disabled. Server process stopped.');
  console.error('====================================================================');
  process.exit(1);
}

const client = new MongoClient(rawDbUrl);
let dbInstance;
let locationsCollection;
let cardsCollection;
let agentsCollection;
let leadsCollection;
let settingsCollection;
let otpLogCollection;

console.log('[Database] Configured to connect to MongoDB Atlas.');

const pool = {
  async query(queryString, params = []) {
    const sql = queryString.trim();
    if (/SELECT id, urn, full_name, card_name, created_at FROM leads/i.test(sql)) {
      const rows = await leadsCollection.find({}, { projection: { urn: 1, full_name: 1, card_name: 1, created_at: 1 } }).toArray();
      return { rows: rows.map(r => ({ ...r, id: r._id })) };
    }
    
    if (/SELECT id, mis_status, mis_data FROM leads WHERE id = ANY/i.test(sql)) {
      const matchedIds = params[0] || [];
      const rows = await leadsCollection.find({ _id: { $in: matchedIds } }, { projection: { mis_status: 1, mis_data: 1 } }).toArray();
      return { rows: rows.map(r => ({ ...r, id: r._id })) };
    }

    if (/SELECT COUNT\(\*\) FROM leads/i.test(sql)) {
      const count = await leadsCollection.countDocuments();
      return { rows: [{ count }] };
    }

    console.warn('[Database Pool Query Warning] Unsupported SQL query:', sql);
    return { rows: [] };
  }
};

const db = {
  pool,
  
  async init() {
    let retries = 5;
    while (retries > 0) {
      try {
        await client.connect();
        
        // Resolve database name from URL if possible, otherwise use default
        const dbName = client.db().databaseName || 'creditmantra';
        dbInstance = client.db(dbName);
        
        locationsCollection = dbInstance.collection('locations');
        cardsCollection = dbInstance.collection('cards');
        agentsCollection = dbInstance.collection('agents');
        leadsCollection = dbInstance.collection('leads');
        settingsCollection = dbInstance.collection('settings');
        otpLogCollection = dbInstance.collection('otp_log');

        // Create indexes
        await leadsCollection.createIndex({ agent_id: 1 });
        await leadsCollection.createIndex({ created_at: -1 });
        await leadsCollection.createIndex({ phone: 1 });
        await leadsCollection.createIndex({ urn: 1 }, { unique: true, sparse: true });
        await leadsCollection.createIndex({ card_id: 1 });
        await leadsCollection.createIndex({ source: 1 });
        
        await agentsCollection.createIndex({ username: 1 }, { unique: true });
        await locationsCollection.createIndex({ name: 1 }, { unique: true });

        // Seed default cards
        const cardCount = await cardsCollection.countDocuments();
        if (cardCount === 0) {
          const defaultCards = [
            {
              _id: 'card_1',
              name: 'HDFC Regalia Gold',
              bank: 'HDFC',
              category: 'Offline',
              description: 'Complimentary Club Vistara & MMT Black memberships. 4 Reward Points per ₹150 spent.',
              redirect_url_template: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/regalia-gold-credit-card?name={name}&phone={phone}&email={email}&urn={urn}',
              display_order: 1,
              active: true,
              thumbnail_url: '',
              card_locations: [],
              ad_id: '',
              utm_internal: '',
              created_at: new Date()
            },
            {
              _id: 'card_2',
              name: 'Diners Club Privilege',
              bank: 'HDFC',
              category: 'Offline',
              description: 'Complimentary annual memberships of Amazon Prime, Swiggy One. 2x on weekend dining.',
              redirect_url_template: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/diners-club-privilege?name={name}&phone={phone}&email={email}&urn={urn}',
              display_order: 2,
              active: true,
              thumbnail_url: '',
              card_locations: [],
              ad_id: '',
              utm_internal: '',
              created_at: new Date()
            },
            {
              _id: 'card_3',
              name: 'Marriott Bonvoy HDFC',
              bank: 'HDFC',
              category: 'Offline',
              description: '1 Free Night Award annually. Silver Elite Status. 8 Marriott Bonvoy Points per ₹150 spent.',
              redirect_url_template: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/marriott-bonvoy?name={name}&phone={phone}&email={email}&urn={urn}',
              display_order: 3,
              active: true,
              thumbnail_url: '',
              card_locations: [],
              ad_id: '',
              utm_internal: '',
              created_at: new Date()
            },
            {
              _id: 'card_4',
              name: 'Swiggy HDFC',
              bank: 'HDFC',
              category: 'Offline',
              description: '10% cashback on Swiggy application. 5% cashback on online shopping. 1% on other spends.',
              redirect_url_template: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/swiggy-hdfc-card?name={name}&phone={phone}&email={email}&urn={urn}',
              display_order: 4,
              active: true,
              thumbnail_url: '',
              card_locations: [],
              ad_id: '',
              utm_internal: '',
              created_at: new Date()
            },
            {
              _id: 'card_5',
              name: 'Tata Neu HDFC Infinity',
              bank: 'HDFC',
              category: 'Offline',
              description: '5% NeuCoins on Tata Neu and partner brands. 1.5% NeuCoins on non-Tata spend.',
              redirect_url_template: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/tata-neu-infinity?name={name}&phone={phone}&email={email}&urn={urn}',
              display_order: 5,
              active: true,
              thumbnail_url: '',
              card_locations: [],
              ad_id: '',
              utm_internal: '',
              created_at: new Date()
            },
            {
              _id: 'card_6',
              name: 'HDFC Pixel Play',
              bank: 'HDFC',
              category: 'Offline',
              description: 'Customizable credit card. Choose your favorite merchants for 5% cashback.',
              redirect_url_template: 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/pixel-play?name={name}&phone={phone}&email={email}&urn={urn}',
              display_order: 6,
              active: true,
              thumbnail_url: '',
              card_locations: [],
              ad_id: '',
              utm_internal: '',
              created_at: new Date()
            }
          ];
          await cardsCollection.insertMany(defaultCards);
          console.log('[Database] Seeded default cards into MongoDB.');
        }

        // Seed default settings
        const settingsCount = await settingsCollection.countDocuments();
        if (settingsCount === 0) {
          const defaultSettings = [
            { _id: 'public_redirect_url', value: 'https://applyonline.hdfcbank.com/cards/credit-cards.html?CHANNELSOURCE=TDCC&DEDUPE=N&DSACode=XFIF&LGcode=public&LCcode=public&urn={urn}', created_at: new Date() },
            { _id: 'otp_message_template', value: 'Your OTP for CreditMantra credit card application is: {otp}. Valid for 5 minutes.', created_at: new Date() },
            { _id: 'consent_text', value: 'I authorise CreditMantra and its partner banks to contact me via call, SMS, WhatsApp and email about credit card offers, even if I am registered under DND/NDNC.', created_at: new Date() },
            { _id: 'terms_link', value: 'https://creditmantra.org/terms', created_at: new Date() },
            { _id: 'privacy_link', value: 'https://creditmantra.org/privacy', created_at: new Date() },
            { _id: 'public_site_url', value: '', created_at: new Date() },
            { _id: 'wa_referral_link_type', value: 'body', created_at: new Date() },
            { _id: 'whatsapp_gateway', value: 'meta', created_at: new Date() },
            { _id: 'csv_export_template', value: DEFAULT_CSV_TEMPLATE, created_at: new Date() },
            { _id: 'pincode_serviceability_mode', value: 'all', created_at: new Date() },
            { _id: 'pincode_serviceability_list', value: '', created_at: new Date() },
            { _id: 'card_manager_banks', value: 'HDFC,SBI', created_at: new Date() },
            {
              _id: 'landing_form_schema',
              value: JSON.stringify({
                fields: {
                  fullName: { visible: true, required: true, label: "Full Name (as per PAN Card)", placeholder: "Enter your full name as per PAN Card" },
                  phone: { visible: true, required: true, label: "Mobile Number", placeholder: "Enter your mobile number" },
                  email: { visible: true, required: true, label: "Email Id", placeholder: "Enter your email ID" },
                  has_credit_card: { visible: true, required: true, label: "Do you already have a credit card?" },
                  employment: {
                    visible: true, required: true, label: "Employment Type",
                    options: [
                      { value: "Salaried", enabled: true },
                      { value: "Self Employed (Business)", enabled: false },
                      { value: "Self Employed (Professional)", enabled: false }
                    ]
                  },
                  monthly_income: { visible: true, required: true, label: "Net Monthly Income", placeholder: "Net Monthly Income" },
                  pan_no: { visible: true, required: true, label: "PAN Card Number", placeholder: "Enter 10-digit PAN Number" },
                  pincode: { visible: true, required: true, label: "Residence Pincode", placeholder: "Residence Pincode" }
                }
              }),
              created_at: new Date()
            }
          ];
          await settingsCollection.insertMany(defaultSettings);
          console.log('[Database] Seeded default settings into MongoDB.');
        }

        console.log('[Database] MongoDB connection established and initialized.');
        return;
      } catch (err) {
        retries--;
        console.error(`[Database] MongoDB init failed (retries left: ${retries}):`, err.message);
        if (retries === 0) {
          throw new Error('All MongoDB connection retry attempts exhausted.');
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  },

  // --- Leads ---
  async getLeads() {
    const res = await leadsCollection.find().sort({ created_at: -1 }).toArray();
    return res.map(row => ({
      ...row,
      id: row._id,
      utm_params: row.utm_params || {}
    }));
  },

  async getLeadByUrn(urn) {
    const row = await leadsCollection.findOne({ urn });
    if (!row) return null;
    return {
      ...row,
      id: row._id,
      utm_params: row.utm_params || {}
    };
  },

  async getAgentByUsername(username) {
    const row = await agentsCollection.findOne({ username, status: 'active' });
    if (!row) return null;
    return {
      ...row,
      id: row._id,
      locations: row.locations || []
    };
  },

  async getLeadsFiltered({ agentId, page = 1, limit = 50, search = '', card = '', source = '', startDate = '', endDate = '' }) {
    const filter = {};
    if (agentId) {
      filter.agent_id = agentId;
    }
    if (search) {
      const s = search.trim();
      filter.$or = [
        { full_name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { urn: { $regex: s, $options: 'i' } },
        { pan_no: { $regex: s, $options: 'i' } }
      ];
    }
    if (card) {
      filter.card_id = card;
    }
    if (source) {
      filter.source = source;
    }
    
    if (startDate || endDate) {
      filter.created_at = {};
      if (startDate) {
        filter.created_at.$gte = new Date(startDate + 'T00:00:00');
      }
      if (endDate) {
        filter.created_at.$lte = new Date(endDate + 'T23:59:59');
      }
    }

    const total = await leadsCollection.countDocuments(filter);
    const offset = (page - 1) * limit;
    
    const rows = await leadsCollection.find(filter)
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    const leads = rows.map(row => ({
      ...row,
      id: row._id,
      utm_params: row.utm_params || {}
    }));

    // Today's leads count (IST)
    const todayISTStr = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
    const todayISTDate = new Date(todayISTStr);
    const yyyy = todayISTDate.getFullYear();
    const mm = String(todayISTDate.getMonth() + 1).padStart(2, '0');
    const dd = String(todayISTDate.getDate()).padStart(2, '0');
    const todayISTStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00+05:30`);
    const todaysCount = await leadsCollection.countDocuments({ created_at: { $gte: todayISTStart } });

    return {
      leads,
      total,
      todaysCount,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  },

  async getLeadsForExport({ startDate, endDate }) {
    const filter = {};
    if (startDate || endDate) {
      filter.created_at = {};
      if (startDate) {
        filter.created_at.$gte = new Date(startDate + 'T00:00:00');
      }
      if (endDate) {
        filter.created_at.$lte = new Date(endDate + 'T23:59:59');
      }
    }

    const rows = await leadsCollection.find(filter).sort({ created_at: -1 }).toArray();
    return rows.map(row => ({
      ...row,
      id: row._id,
      utm_params: row.utm_params || {}
    }));
  },

  async addLead(lead) {
    const now = new Date();
    const formatterObj = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatterObj.formatToParts(now);
    const dateMap = {};
    parts.forEach(p => dateMap[p.type] = p.value);
    const yearStr = dateMap.year;
    const monthLetter = String.fromCharCode(65 + (parseInt(dateMap.month, 10) - 1));
    const dayStr = dateMap.day;
    const prefix = `FM${yearStr}${monthLetter}${dayStr}`;
    
    const seqMatches = await leadsCollection.find({ urn: { $regex: `^${prefix}` } }).toArray();
    let sequence = 1;
    if (seqMatches.length > 0) {
      const sequences = seqMatches.map(row => {
        const seqStr = row.urn.replace(prefix, '');
        return parseInt(seqStr, 10) || 0;
      });
      sequence = Math.max(...sequences) + 1;
    }
    const urn = `${prefix}${String(sequence).padStart(5, '0')}`;
    const id = 'lead_' + Math.random().toString(36).substr(2, 9);
    
    const doc = {
      _id: id,
      urn,
      full_name: lead.full_name,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      employment: lead.employment,
      income_range: lead.income_range,
      card_id: lead.card_id,
      card_name: lead.card_name,
      card_bank: lead.card_bank,
      source: lead.source || 'public',
      agent_id: lead.agent_id,
      agent_name: lead.agent_name,
      agent_location: lead.agent_location,
      consent: lead.consent !== undefined ? lead.consent : true,
      utm_source: lead.utm_source,
      utm_info: lead.utm_info,
      utm_creative_format: lead.utm_creative_format,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_term: lead.utm_term,
      utm_content: lead.utm_content,
      utm_channel: lead.utm_channel,
      utm_category: lead.utm_category,
      fbclid: lead.fbclid,
      gclid: lead.gclid,
      gclsrc: lead.gclsrc,
      dclid: lead.dclid,
      msclkid: lead.msclkid,
      ttclid: lead.ttclid,
      twclid: lead.twclid,
      li_fat_id: lead.li_fat_id,
      utm_id: lead.utm_id,
      utm_creative: lead.utm_creative,
      utm_keyword: lead.utm_keyword,
      utm_matchtype: lead.utm_matchtype,
      utm_network: lead.utm_network,
      utm_placement: lead.utm_placement,
      utm_device: lead.utm_device,
      utm_location: lead.utm_location,
      gbraid: lead.gbraid,
      wbraid: lead.wbraid,
      landing_page: lead.landing_page,
      first_landing_page: lead.first_landing_page,
      referrer: lead.referrer,
      ad_id: lead.ad_id,
      utm_params: lead.utm_params || {},
      redirect_url: lead.redirect_url || '',
      ip_address: lead.ip_address || null,
      user_agent: lead.user_agent || null,
      capi_status: lead.capi_status || null,
      capi_response: lead.capi_response || null,
      utm_internal: lead.utm_internal || null,
      has_credit_card: lead.has_credit_card || null,
      pincode: lead.pincode || null,
      monthly_income: lead.monthly_income || null,
      pan_no: lead.pan_no || null,
      dob: lead.dob || null,
      mother_name: lead.mother_name || null,
      current_address: lead.current_address || null,
      designation: lead.designation || null,
      created_at: new Date()
    };
    
    await leadsCollection.insertOne(doc);
    return { id, urn, ...lead, created_at: doc.created_at.toISOString() };
  },

  async updateLead(id, lead) {
    const updateDoc = { ...lead };
    delete updateDoc._id;
    delete updateDoc.id;
    await leadsCollection.updateOne({ _id: id }, { $set: updateDoc });
    return { id, ...lead };
  },

  async deleteLead(id) {
    await leadsCollection.deleteOne({ _id: id });
    return true;
  },

  async deleteLeads(ids) {
    await leadsCollection.deleteMany({ _id: { $in: ids } });
    return true;
  },

  async unmapLead(id) {
    await leadsCollection.updateOne({ _id: id }, { $set: { mis_status: null, mis_mapped_at: null, mis_data: {} } });
    return true;
  },

  async unmapLeads(ids) {
    await leadsCollection.updateMany({ _id: { $in: ids } }, { $set: { mis_status: null, mis_mapped_at: null, mis_data: {} } });
    return true;
  },

  // --- Cards ---
  async getCards(includeInactive = false) {
    const query = includeInactive ? {} : { active: true };
    const cards = await cardsCollection.find(query).sort({ display_order: 1 }).toArray();
    return cards.map(row => ({
      ...row,
      id: row._id,
      card_locations: row.card_locations || []
    }));
  },

  async addCard(card) {
    const id = 'card_' + Math.random().toString(36).substr(2, 9);
    const displayOrder = card.display_order || 1;
    const active = card.active !== undefined ? card.active : true;
    const doc = {
      _id: id,
      name: card.name,
      bank: card.bank,
      category: card.category,
      description: card.description,
      redirect_url_template: card.redirect_url_template,
      display_order: displayOrder,
      active: active,
      thumbnail_url: card.thumbnail_url || '',
      card_locations: card.card_locations || [],
      ad_id: card.ad_id || '',
      utm_internal: card.utm_internal || '',
      created_at: new Date()
    };
    await cardsCollection.insertOne(doc);
    return { id, ...card, display_order: displayOrder, active, card_locations: card.card_locations || [] };
  },

  async updateCard(id, cardData) {
    const updateDoc = { ...cardData };
    delete updateDoc._id;
    delete updateDoc.id;
    const res = await cardsCollection.findOneAndUpdate(
      { _id: id },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );
    const doc = res.value || res;
    if (doc) {
      return { ...doc, id: doc._id, card_locations: doc.card_locations || [] };
    }
    return null;
  },

  async deleteCard(id) {
    await cardsCollection.deleteOne({ _id: id });
    return true;
  },

  // --- Agents ---
  async getAgents() {
    const res = await agentsCollection.find().sort({ created_at: 1 }).toArray();
    return res.map(row => ({
      ...row,
      id: row._id,
      locations: row.locations || []
    }));
  },

  async addAgent(agent) {
    const doc = {
      _id: agent.id,
      name: agent.name,
      phone: agent.phone || '',
      email: agent.email || '',
      username: agent.username,
      password_hash: agent.password_hash,
      status: agent.status || 'active',
      locations: agent.locations || [],
      assigned_bank: agent.assigned_bank || null,
      created_at: new Date()
    };
    await agentsCollection.insertOne(doc);
    return agent;
  },

  async updateAgent(id, agentData) {
    const updateDoc = { ...agentData };
    delete updateDoc._id;
    delete updateDoc.id;
    const res = await agentsCollection.findOneAndUpdate(
      { _id: id },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );
    const doc = res.value || res;
    if (doc) {
      return { ...doc, id: doc._id, locations: doc.locations || [] };
    }
    return null;
  },

  async deleteAgent(id) {
    await agentsCollection.deleteOne({ _id: id });
    return true;
  },

  // --- Locations ---
  async getLocations() {
    const res = await locationsCollection.find().sort({ created_at: 1 }).toArray();
    return res.map(l => ({ ...l, id: l._id }));
  },

  async addLocation(loc) {
    const id = 'loc_' + Math.random().toString(36).substr(2, 9);
    const name = loc.name;
    const active = loc.active !== undefined ? loc.active : true;
    const doc = {
      _id: id,
      name,
      active,
      created_at: new Date()
    };
    await locationsCollection.insertOne(doc);
    return { id, name, active };
  },

  async updateLocation(id, locData) {
    const updateDoc = { ...locData };
    delete updateDoc._id;
    delete updateDoc.id;
    const res = await locationsCollection.findOneAndUpdate(
      { _id: id },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );
    const doc = res.value || res;
    if (doc) {
      return { ...doc, id: doc._id };
    }
    return null;
  },

  async deleteLocation(id) {
    await locationsCollection.deleteOne({ _id: id });
    return true;
  },

  // --- Settings ---
  async getSettings() {
    const rows = await settingsCollection.find().toArray();
    const settings = {};
    rows.forEach(row => {
      const val = row.value ? String(row.value).trim() : '';
      if (val && val !== 'undefined' && val !== 'null') {
        settings[row._id] = val;
      }
    });
    if (settings.whatsapp_gateway === undefined) {
      settings.whatsapp_gateway = 'meta';
    }
    if (settings.csv_export_template === undefined) {
      settings.csv_export_template = DEFAULT_CSV_TEMPLATE;
    }
    return settings;
  },

  async updateSettings(settingsData) {
    for (const [key, value] of Object.entries(settingsData)) {
      if (value !== undefined && value !== null) {
        await settingsCollection.updateOne(
          { _id: key },
          { $set: { value: String(value).trim(), created_at: new Date() } },
          { upsert: true }
        );
      }
    }
    return this.getSettings();
  },

  // --- OTP ---
  async saveOTP(phone, otp) {
    const now = new Date().getTime();
    await otpLogCollection.updateOne(
      { _id: phone },
      { $set: { otp, created_at: now, verified: false, attempts: 0 } },
      { upsert: true }
    );
    return true;
  },

  async verifyOTP(phone, otp) {
    const log = await otpLogCollection.findOne({ _id: phone });
    if (!log) return { success: false, reason: 'No OTP generated' };

    const now = new Date().getTime();
    if (now - parseInt(log.created_at, 10) > 5 * 60 * 1000) {
      return { success: false, reason: 'OTP expired (5 mins limit)' };
    }

    if (log.attempts >= 3) {
      return { success: false, reason: 'Max verification attempts exceeded' };
    }

    if (log.otp === otp) {
      await otpLogCollection.updateOne({ _id: phone }, { $set: { verified: true } });
      return { success: true };
    } else {
      const newAttempts = log.attempts + 1;
      await otpLogCollection.updateOne({ _id: phone }, { $set: { attempts: newAttempts } });
      return { success: false, reason: `Invalid OTP. Attempts left: ${3 - newAttempts}` };
    }
  },

  async updateLeadMISStatus(id, misStatus, misData) {
    await leadsCollection.updateOne(
      { _id: id },
      { $set: { mis_status: misStatus, mis_mapped_at: new Date(), mis_data: misData } }
    );
    const lead = await leadsCollection.findOne({ _id: id });
    return lead ? { id: lead._id, urn: lead.urn, full_name: lead.full_name } : null;
  },

  async getMISStats() {
    const totalLeads = await leadsCollection.countDocuments();
    const mappedLeadsList = await leadsCollection.find({ mis_status: { $ne: null } }).sort({ mis_mapped_at: -1 }).toArray();
    
    const expandedList = [];
    mappedLeadsList.forEach(row => {
      let misDataObj = {};
      try {
        misDataObj = typeof row.mis_data === 'string' ? JSON.parse(row.mis_data) : (row.mis_data || {});
        if (misDataObj && Array.isArray(misDataObj.history) && misDataObj.history.length > 0) {
          const latest = misDataObj.history[misDataObj.history.length - 1];
          misDataObj = latest.data || {};
        }
      } catch (e) {
        misDataObj = {};
      }

      expandedList.push({
        ...row,
        id: row._id,
        mis_data: misDataObj,
        utm_params: row.utm_params || {}
      });
    });

    const totalMapped = expandedList.length;

    const statusBreakdown = {};
    expandedList.forEach(r => {
      const status = r.mis_status || 'Unknown';
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });

    const cardDistMap = {};
    expandedList.forEach(r => {
      const cardName = r.mis_data?.card_name || 'Unknown';
      cardDistMap[cardName] = (cardDistMap[cardName] || 0) + 1;
    });
    const cardDistribution = Object.entries(cardDistMap).map(([name, count]) => ({ name, count }));

    const timelineMap = {};
    expandedList.forEach(r => {
      if (r.mis_mapped_at) {
        const dateStr = new Date(r.mis_mapped_at).toISOString().split('T')[0];
        timelineMap[dateStr] = (timelineMap[dateStr] || 0) + 1;
      }
    });
    const timeline = Object.entries(timelineMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-15);

    const kycMap = {};
    expandedList.forEach(r => {
      const kycType = r.mis_data?.kyc_type || 'Unknown';
      kycMap[kycType] = (kycMap[kycType] || 0) + 1;
    });
    const kycDistribution = Object.entries(kycMap).map(([name, count]) => ({ name, count }));

    const sourceMap = {};
    expandedList.forEach(r => {
      let sourceType = String(r.mis_data?.source_type || '').trim();
      if (!sourceType || sourceType === '-') sourceType = 'Blank';
      sourceMap[sourceType] = (sourceMap[sourceType] || 0) + 1;
    });
    const sourceDistribution = Object.entries(sourceMap).map(([name, count]) => ({ name, count }));

    const cardTypeMap = {};
    expandedList.forEach(r => {
      const cardType = r.mis_data?.card_type || 'Unknown';
      cardTypeMap[cardType] = (cardTypeMap[cardType] || 0) + 1;
    });
    const cardTypeDistribution = Object.entries(cardTypeMap).map(([name, count]) => ({ name, count }));

    const custTypeMap = {};
    expandedList.forEach(r => {
      const custType = r.mis_data?.customer_type || 'Unknown';
      custTypeMap[custType] = (custTypeMap[custType] || 0) + 1;
    });
    const customerTypeDistribution = Object.entries(custTypeMap).map(([name, count]) => ({ name, count }));

    const activeStatusMap = {};
    expandedList.forEach(r => {
      const act = r.mis_data?.card_activation_status || 'Inactive/Unknown';
      activeStatusMap[act] = (activeStatusMap[act] || 0) + 1;
    });
    const activationStatusDistribution = Object.entries(activeStatusMap).map(([name, count]) => ({ name, count }));

    const pinMap = {};
    expandedList.forEach(r => {
      const pin = r.mis_data?.PIN_CODE || r.mis_data?.pin_code || r.pincode || 'Unknown';
      pinMap[pin] = (pinMap[pin] || 0) + 1;
    });
    const pincodeHeatmap = Object.entries(pinMap)
      .map(([pincode, count]) => ({ pincode, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);

    const funnelSubmit = totalLeads;
    
    const funnelIpa = expandedList.filter(l => {
      const ipa = String(l.mis_data?.ipa_status || '').toLowerCase();
      return ipa.includes('approve') || ipa.includes('success');
    }).length;

    const funnelKyc = expandedList.filter(l => {
      const ks = String(l.mis_data?.kyc_status || '').toLowerCase();
      const vs = String(l.mis_data?.vkyc_status || '').toLowerCase();
      const kt = String(l.mis_data?.kyc_type || '').toLowerCase();
      return ks.includes('success') || ks.includes('complete') || vs.includes('success') || vs.includes('complete') || ks.includes('biokyc') || kt.includes('biokyc');
    }).length;

    const funnelDecision = expandedList.filter(l => {
      const dec = String(l.mis_data?.final_decision || '').toLowerCase();
      return dec.includes('approve') || dec.includes('success');
    }).length;

    const funnelActive = expandedList.filter(l => {
      const act = String(l.mis_data?.card_activation_status || '').toLowerCase();
      return act.includes('active') || act === 'yes';
    }).length;

    return {
      totalLeads,
      totalMapped,
      statusBreakdown,
      cardDistribution,
      timeline,
      kycDistribution,
      sourceDistribution,
      cardTypeDistribution,
      customerTypeDistribution,
      activationStatusDistribution,
      pincodeHeatmap,
      mappedLeadsList: expandedList,
      funnel: {
        submit: funnelSubmit,
        ipa: funnelIpa,
        kyc: funnelKyc,
        decision: funnelDecision,
        active: funnelActive
      }
    };
  },

  async bulkUpdateLeadMISStatus(updates) {
    if (!updates || updates.length === 0) return;
    const bulkOps = updates.map(up => ({
      updateOne: {
        filter: { _id: up.id },
        update: { $set: { mis_status: up.status, mis_mapped_at: new Date(), mis_data: up.data } }
      }
    }));
    await leadsCollection.bulkWrite(bulkOps);
  }
};

module.exports = db;
