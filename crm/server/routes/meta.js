const express = require('express');
const router = express.Router();
const {
  COUNTRIES, CONTACT_CHANNELS, CUSTOMER_TYPES,
  DEAL_STAGES, DOCUMENT_TYPES, FOLLOWUP_TYPES,
} = require('../constants');

router.get('/', (req, res) => {
  res.json({
    countries: COUNTRIES,
    channels: CONTACT_CHANNELS,
    customerTypes: CUSTOMER_TYPES,
    dealStages: DEAL_STAGES,
    documentTypes: DOCUMENT_TYPES,
    followupTypes: FOLLOWUP_TYPES,
  });
});

module.exports = router;
