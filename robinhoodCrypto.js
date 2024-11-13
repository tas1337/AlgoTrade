require('dotenv').config();
const axios = require('axios');
const nacl = require('tweetnacl');
const base64 = require('base64-js');

const { API_KEY, BASE64_PRIVATE_KEY, BASE_URL } = process.env;

class RobinhoodCrypto {
    constructor() {
        this.apiKey = API_KEY;

        const privateKeyBuffer = base64.toByteArray(BASE64_PRIVATE_KEY);
        if (privateKeyBuffer.length !== 64) {
            throw new Error('Invalid private key length: must be exactly 64 bytes.');
        }

        this.privateKey = privateKeyBuffer;
    }

    getCurrentTimestamp() {
        return Math.floor(Date.now() / 1000);
    }

    generateSignature(path, method, body) {
        const timestamp = this.getCurrentTimestamp();
        const message = `${this.apiKey}${timestamp}${path}${method}${body}`;

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

    // Fetches the account information
    async getAccount() {
        return await this.makeRequest('GET', '/api/v1/crypto/trading/accounts/');
    }

    // Fetches trading pairs for specified symbols
    async getTradingPairs(symbols = []) {
        const query = symbols.length ? '?symbol=' + symbols.join('&symbol=') : '';
        const response = await this.makeRequest('GET', `/api/v1/crypto/trading/trading_pairs/${query}`);
    
        if (response && Array.isArray(response.results)) {
            console.log("Available symbols:", response.results.map(pair => pair.symbol)); // Log available symbols
            return response;
        } else {
            console.error("Error fetching trading pairs or unexpected response format:", response);
            return null;
        }
    }
    

    // Fetches holdings for specified asset codes
    async getHoldings(assetCodes = []) {
        const query = assetCodes.length
            ? '?asset_code=' + assetCodes.join('&asset_code=')
            : '';
        return await this.makeRequest(
            'GET',
            `/api/v1/crypto/trading/holdings/${query}`
        );
    }

    // Fetches the best bid and ask prices for given symbols
    async getBestBidAsk(symbols) {
        const params = symbols.map(symbol => `symbol=${symbol}`).join('&');
        const path = `/api/v1/crypto/marketdata/best_bid_ask/?${params}`;

        const response = await this.makeRequest('GET', path);

        // Debug log to inspect the API response format
        // console.log("getBestBidAsk response:", response);

        if (response && Array.isArray(response.results)) {
            return response.results;
        } else {
            console.error("Error fetching best bid/ask data or unexpected response format:", response);
            return [];
        }
    } 
    // Places an order with specified parameters
    async placeOrder(clientOrderId, side, orderType, symbol, config) {
        const path = '/api/v1/crypto/trading/orders/';
        const body = JSON.stringify({
            client_order_id: clientOrderId,
            side,
            type: orderType,
            symbol,
            [`${orderType}_order_config`]: config,
        });
        return await this.makeRequest('POST', path, body);
    }

    // Cancels an order by ID
    async cancelOrder(orderId) {
        return await this.makeRequest(
            'POST',
            `/api/v1/crypto/trading/orders/${orderId}/cancel/`
        );
    }
}

module.exports = RobinhoodCrypto;
