import fs from 'fs'
import p2bb2p_api from "./src/api/p2bb2p_api.js";


let config = null;
async function start() {
    fs.readFile('./config.json', 'utf8', async (error, data) => {
        if (error) {
            console.log(error);
            return;
        } 
         config = JSON.parse(data); 
 
         const p2b = new p2bb2p_api(config);

         setInterval(async () => { 
            
            await p2b.start();
             
        }, 1000)

        
          
         
    });
}

start();

