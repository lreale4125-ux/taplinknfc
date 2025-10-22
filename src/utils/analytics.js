const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');

/**
 * Records a click event in the analytics database
 * @param {number} linkId - The ID of the link being accessed
 * @param {string|number} keychainId - The keychain ID (optional)
 * @param {object} req - Express request object
 */
function recordClick(linkId, keychainId, req) {
    const db = require('../db/database');

    const ip = req.headers['x-forwarded-for'] || req.ip || req.connection.remoteAddress;
    const geo = geoip.lookup(ip) || {};
    const userAgent = req.get('User-Agent');

    const lat = (geo.ll && geo.ll[0]) ? geo.ll[0] : null;
    const lon = (geo.ll && geo.ll[1]) ? geo.ll[1] : null;

    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    const osName = result.os.name;
    const browserName = result.browser.name;
    const deviceType = result.device.type || 'Sconosciuto';

    const stmt = db.prepare(`
        INSERT INTO analytics (
            link_id, keychain_id, ip_address, user_agent, referrer, country, city, lat, lon,
            os_name, browser_name, device_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(link_id, ip_address, keychain_id) DO UPDATE SET
            click_count = click_count + 1,
            last_seen = CURRENT_TIMESTAMP,
            user_agent = excluded.user_agent,
            os_name = excluded.os_name,
            browser_name = excluded.browser_name,
            device_type = excluded.device_type
    `);

    stmt.run(
        linkId, keychainId, ip, userAgent, req.get('Referrer'),
        geo.country, geo.city, lat, lon,
        osName, browserName, deviceType
    );
}

module.exports = {
    recordClick
};