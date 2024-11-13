require('dotenv').config();
const axios = require('axios');
const nacl = require('tweetnacl');
const base64 = require('base64-js');

const { API_KEY, BASE64_PRIVATE_KEY, BASE_URL } = process.env;

class RobinhoodCrypto {
    constructor() {
        this.apiKey = API_KEY;

        // Decode the private key and validate its length
        const privateKeyBuffer = base64.toByteArray(BASE64_PRIVATE_KEY);
        if (privateKeyBuffer.length !== 64) {
            throw new Error('Invalid private key length: must be exactly 64 bytes.');
        }

        // Use the entire 64-byte secret key directly
        this.privateKey = privateKeyBuffer;
    }

    getCurrentTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    generateSignature(path, method, body) {
        const timestamp = this.getCurrentTimestamp();
        const message = `${this.apiKey}${timestamp}${path}${method}${body}`;

        // Sign the message using the 64-byte private key
        const signedMessage = nacl.sign.detached(
            Buffer.from(message),
            this.privateKey
        );

        return {
            'x-api-key': this.apiKey,
            'x-signature': Buffer.from(signedMessage).toString('base64'),
            'x-timestamp': timestamp.toString(),
        };
    }

    async makeRequest(method, path, body = '') {
        const headers = this.generateSignature(path, method, body);
        const url = `${BASE_URL}${path}`;
        try {
            const response =
                method === 'GET'
                    ? await axios.get(url, { headers })
                    : await axios.post(url, JSON.parse(body), { headers });
            return response.data;
        } catch (error) {
            console.error('API request error:', error.response?.data || error.message);
            return null;
        }
    }

    getAccount() {
        return this.makeRequest('GET', '/api/v1/crypto/trading/accounts/');
    }

    getTradingPairs(symbols = []) {
        const query = symbols.length
            ? '?symbol=' + symbols.join('&symbol=')
            : '';
        return this.makeRequest(
            'GET',
            `/api/v1/crypto/trading/trading_pairs/${query}`
        );
    }

    getHoldings(assetCodes = []) {
        const query = assetCodes.length
            ? '?asset_code=' + assetCodes.join('&asset_code=')
            : '';
        return this.makeRequest(
            'GET',
            `/api/v1/crypto/trading/holdings/${query}`
        );
    }

    placeOrder(clientOrderId, side, orderType, symbol, config) {
        const path = '/api/v1/crypto/trading/orders/';
        const body = JSON.stringify({
            client_order_id: clientOrderId,
            side,
            type: orderType,
            symbol,
            [`${orderType}_order_config`]: config,
        }); 
        return this.makeRequest('POST', path, body);
    }

    cancelOrder(orderId) {
        return this.makeRequest(
            'POST',
            `/api/v1/crypto/trading/orders/${orderId}/cancel/`
        );
    }
}

module.exports = RobinhoodCrypto;
