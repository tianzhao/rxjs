# rxjs 

This is a implementation of RxJS API using a thread-like abstraction. 
The goal is to understand the semantics of RxJS computation and provide an easier way to debug RxJS programs.

For usage, please reference the test cases that can be found in the test folder. All operators were tested.
The tests are done primarily on Chrome browser. We try to emulate the semantics of the reference RxJS as close as possible.
Right now, we only support default scheduler, where the internal events are synchronously handled. 
To use async scheduler, the source code need to be modified slightly. Not all options of the RxJS operators are supported. 
