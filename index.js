import pkg from "emitter";
import fs from 'fs'
import logger from "./src//utils/logger.js"; 
import PricingService from "./src/services/PricingService.js";

const { EventEmitter } = pkg;
const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(1);
let config = null;
async function start() {
    fs.readFile('./config.json', 'utf8', async (error, data) => {
        if (error) {
            console.log(error);
            return;
        }

         config = JSON.parse(data);
 
        const pricer = new PricingService(eventEmitter,config); 
        pricer.start();

 


        eventEmitter.on('newListener', (event, listener) => {
            logger.info(`Added Signal Server ${event.toUpperCase()} listener.`);
        });

        eventEmitter.on('tradeSignal', async (tradeSignal) => {
            logger.info('Recieved New Signal ');

            try { 
                 

            } catch (error) {
                logger.error(error)
            }


        });


        eventEmitter.on('ConnectionHandler', (message) => {
            logger.info('Disconnected -- need to restart ' + message.toUpperCase());
            eventEmitter.removeAllListeners();
            start();

        });

    });
}

start();

