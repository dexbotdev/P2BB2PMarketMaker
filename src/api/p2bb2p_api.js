import { createHmac } from 'crypto';
import axios from 'axios';
import logger from '../utils/logger.js';

const notValidStatuses = [
    401, // ~Invalid auth, payload, nonce
    429, // Too many requests
    423, // Temporary block
    500, // Service temporary unavailable
    // 400, ~Processed with an error
    // 422, ~Data validation error
];

const WEB_BASE = 'https://api.p2pb2b.io';
const WEB_BASE_PREFIX = '/api/v2';
const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
};

class p2bb2p_api {


    constructor(configdata) {

        this.configdata = configdata;

        this.config = {
            'apiKey': configdata.apiKey,
            'secretKey': configdata.secretKey,
        };
    }

    /**
   * Handles response from API
   * @param {Object} responseOrError
   * @param resolve
   * @param reject
   * @param {String} bodyString
   * @param {String} queryString
   * @param {String} url
   */
    handleResponse = (responseOrError, resolve, reject, bodyString, queryString, url) => {
        const httpCode = responseOrError?.status || responseOrError?.response?.status;
        const httpMessage = responseOrError?.statusText || responseOrError?.response?.statusText;

        const p2bData = responseOrError?.data || responseOrError?.response?.data;
        const p2bStatus = p2bData?.success;
        const p2bErrorCode = p2bData?.errorCode || p2bData?.status;
        const p2bErrorMessage = p2bData?.message || p2bData?.errors?.message?.[0];
        const p2bErrorInfo = p2bErrorCode ? `[${p2bErrorCode}] ${p2bErrorMessage}` : `[No error code]`;

        const errorMessage = httpCode ? `${httpCode} ${httpMessage}, ${p2bErrorInfo}` : String(responseOrError);
        const reqParameters = queryString || bodyString || '{ No parameters }';

        try {
            if (p2bStatus) {
                resolve(p2bData);
            } else if (p2bErrorCode) {
                if (p2bData) {
                    p2bData.p2bErrorInfo = p2bErrorInfo;
                }

                if (notValidStatuses.includes(httpCode)) {
                    logger.info(`P2PB2B request to ${url} with data ${reqParameters} failed: ${errorMessage}. Rejecting…`);
                    reject(p2bData);
                } else {
                    logger.info(`P2PB2B processed a request to ${url} with data ${reqParameters}, but with error: ${errorMessage}. Resolving…`);
                    resolve(p2bData);
                }
            } else {
                logger.warning(`Request to ${url} with data ${reqParameters} failed: ${errorMessage}. Rejecting…`);
                reject(errorMessage);
            }
        } catch (e) {
            logger.error(`Error while processing response of request to ${url} with data ${reqParameters}: ${e}. Data object I've got: ${JSON.stringify(p2bData)}.`);
            reject(`Unable to process data: ${JSON.stringify(p2bData)}. ${e}`);
        }
    }

    publicRequest = (path, data) => {
        let url = `${WEB_BASE}${WEB_BASE_PREFIX}${path}`;
        const urlBase = url;

        const params = [];
        for (const key in data) {
            const v = data[key];
            params.push(key + '=' + v);
        }

        const queryString = params.join('&');
        if (queryString) {
            url = url + '?' + queryString;
        }

        return new Promise((resolve, reject) => {
            const httpOptions = {
                url: url,
                method: 'get',
                timeout: 10000,
                headers: DEFAULT_HEADERS,
            };
            //logger.info(JSON.stringify(httpOptions))    

            axios(httpOptions)
                .then((response) => this.handleResponse(response, resolve, reject, undefined, queryString, urlBase))
                .catch((error) => this.handleResponse(error, resolve, reject, undefined, queryString, urlBase));
        });
    }

    protectedRequest = (path, data) => {
        const url = `${WEB_BASE}${path}`;
        const urlBase = url;

        let headers;
        let bodyString;

        try {
            data = {
                ...data,
                request: `${WEB_BASE_PREFIX}${path}`,
                nonce: Date.now(),
            };

            bodyString = this.getBody(data);

            headers = {
                ...DEFAULT_HEADERS,
                'X-TXC-APIKEY': this.config.apiKey,
                'X-TXC-PAYLOAD': this.getPayload(bodyString),
                'X-TXC-SIGNATURE': this.getSignature(this.getPayload(bodyString)),
            };
        } catch (err) {
            logger.info(`Processing of request to ${url} with data ${bodyString} failed. ${err}.`);
            return Promise.reject(err.toString());
        }

        return new Promise((resolve, reject) => {
            const httpOptions = {
                url: urlBase,
                method: 'post',
                data,
                headers,
            };


            //logger.info(JSON.stringify(`https://api.p2pb2b.com/api/v2${path}`))    

            axios.post("https://api.p2pb2b.com/api/v2" + path, data, { headers: headers })
                .then((response) => {
                    this.handleResponse(response, resolve, reject, bodyString, undefined, urlBase)

                    //console.log(response)
                })
                .catch((error) => {

                    //console.log(error)
                    this.handleResponse(error, resolve, reject, bodyString, undefined, urlBase)
                });


            //axios(httpOptions)
            //  .then((response) => this.handleResponse(response, resolve, reject, bodyString, undefined, urlBase))
            //.catch((error) => this.handleResponse(error, resolve, reject, bodyString, undefined, urlBase));
        });
    }


    getBody = (data) => {
        return JSON.stringify(data);
    };

    getPayload = (body) => {
        return new Buffer.from(body).toString('base64');
    };

    getSignature = (payload) => {
        return createHmac('sha512', this.config.secretKey).update(payload).digest('hex');
    };

    getBalances = () => {
        const data = {};
        return this.protectedRequest('/account/balances', data);
    }


    /**
        * Query account active orders
        * @param {String} pair In P2PB2B format as ETH_USDT
        * @param {Number} limit min 1, default 50, max 100
        * @param {Number} offset min 0, default 0, max 10000
        * @return {Object}
        * https://github.com/P2B-team/p2b-api-docs/blob/master/api-doc.md#order-list
        */
    getOrders = (pair, offset = 0, limit = 100) => {
        const data = {};
        if (pair) data.market = pair;
        if (offset) data.offset = offset;
        if (limit) data.limit = limit;

        return this.protectedRequest('/orders', data);
    }

    /**
     * Query order deals
     * The request returns a json with 'order deals' items list
     * Warn: result is cached. It means if order was filled and you'll request deals in 1 second after it, result will be [].
     * @param {String} orderId Exchange's orderId as 120531775560
     * @param {Number} offset Min value 0. Default 0. Max value 10000.
     * @param {Number} limit Min value 1. Default value 50. Max value 100.
     * @return {Object}
     * https://github.com/P2B-team/p2b-api-docs/blob/master/api-doc.md#order-deals
     * Incorrect orderId: { success: false, errorCode: 3080, message: 'Invalid orderId value', result: [], p2bErrorInfo: ..'
     * Order doesn't exist or No deals or Cancelled: { success: true, result: { offset: 0, limit: 100, records: [] }, ..'
     */
    getOrderDeals = (orderId, offset = 0, limit = 100) => {
        const data = {
            orderId,
            offset,
            limit,
        };

        return this.protectedRequest('/account/order', data);
    }

    /**
     * Places a Limit order. P2PB2B doesn't support market orders.
     * @param {String} market In P2PB2B format as ETH_USDT
     * @param {String} amount Order amount
     * @param {String} price Order price
     * @param {String} side 'buy' or 'sell'
     * https://github.com/P2B-team/p2b-api-docs/blob/master/api-doc.md#create-order
     */
    addOrder = (market, amount, price, side) => {
        const data = {
            market,
            amount: String(amount),
            price: String(price),
            side,
        };

        return this.protectedRequest('/order/new', data);
    }

    /**
     * Cancel an order
     * @param {String} orderId
     * @param {String} market
     * @return {Object}
     */
    cancelOrder = (orderId, market) => {
        const data = {
            orderId,
            market,
        };

        return this.protectedRequest('/order/cancel', data);
    }

    /**
     * Get trade details for a ticker (market rates)
     * @param {String} market
     * @return {Object}
     */
    ticker = (market) => {
        const data = {
            market,
        };

        return this.publicRequest('/public/ticker', data);
    }

    /**
     * Get market depth
     * https://github.com/P2pb2b-team/p2pb2b-api-docs/blob/master/api-doc.md#depth-result
     * @param pair
     * @param {Number} limit min 1, default 50, max 100
     * @param {Number} interval One of 0, 0.00000001, 0.0000001, 0.000001, 0.00001, 0.0001, 0.001, 0.01, 0.1, 1. Default 0.
     * @return {Object}
     */
    orderBook = (pair, limit = 100, interval = 0) => {
        const data = {};
        data.market = pair;
        if (limit) data.limit = limit;
        if (interval) data.interval = interval;
        return this.publicRequest('/public/depth/result', data);
    }

    /**
     * Get trades history
     * Results are cached for ~5s
     * @param market Trading pair, like BTC_USDT
     * @param {Number} lastId Executed order id (Mandatory). It seems, if lastId = 1, it returns last trades
     * @param {Number} limit min 1, default 50, max 100
     * @return {Array of Object} Last trades
     * https://github.com/P2B-team/p2b-api-docs/blob/master/api-doc.md#history
     */
    getTradesHistory = (market, lastId = 1, limit = 100) => {
        const data = {
            market,
            lastId,
            limit,
        };

        return this.publicRequest(`/public/history`, data);
    }

    /**
     * Get info on all markets
     * @return string
     */
    markets = () => {
        const data = {};
        return this.publicRequest('/public/markets', data);
    }


    async start() {



        const ticker = await this.ticker(this.configdata.pair);
        //console.log(ticker.result.last)

        const ordersList = await this.getOrders(this.configdata.pair, 0, 100)
        //console.log(ordersList.result)

        if (ordersList.result && ordersList.result.length === 0) {
            logger.sponsor('There are No Open Trades Placing Fresh Trades')
            const upperLimitSell = (ticker.result.last * (1 + this.configdata.range / 100)).toFixed(5);
            const lowerLimitBuy = (ticker.result.last * (1 - this.configdata.range / 100)).toFixed(5);

            await this.addOrder(this.configdata.pair, this.configdata.fundstoUsePerTrade, upperLimitSell, 'sell');
            await this.addOrder(this.configdata.pair, this.configdata.fundstoUsePerTrade, lowerLimitBuy, 'buy')
        } else {

            if (ordersList.result.length < 2) {

                await this.cancelOrder(ordersList.result[0].orderId, this.configdata.pair);

                const upperLimitSell = (ticker.result.last * (1 + this.configdata.range / 100)).toFixed(5);
                const lowerLimitBuy = (ticker.result.last * (1 - this.configdata.range / 100)).toFixed(5);

                await this.addOrder(this.configdata.pair, this.configdata.fundstoUsePerTrade, upperLimitSell, 'sell');
                await this.addOrder(this.configdata.pair, this.configdata.fundstoUsePerTrade, lowerLimitBuy, 'buy')

            }

        }


    }


}

export default p2bb2p_api;